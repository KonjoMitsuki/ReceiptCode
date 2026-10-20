import { expect, test } from '@playwright/test';

const previewBaseURL = 'http://127.0.0.1:4175/receipt2jan/';

test.use({ baseURL: previewBaseURL });

test('本番ビルドがサブパスで配信され、手入力フローが動く', async ({
  page,
}) => {
  const failedResponses: string[] = [];
  const externalRequests: string[] = [];
  const appOrigin = new URL(previewBaseURL).origin;

  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== appOrigin && !url.protocol.startsWith('data')) {
      externalRequests.push(request.url());
    }
  });

  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: /レシートから\s*JANを読み取る/ }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/receipt2jan/');

  // CSSが読み込まれていること（未適用時のbody背景は白）。
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe('rgb(244, 241, 234)');

  await page
    .getByRole('button', { name: 'JANを手入力して始める' })
    .click();
  const manualForm = page.getByRole('form', {
    name: 'JANを手入力で追加',
  });
  await manualForm.getByLabel('商品名（任意）').fill('本番確認商品');
  await manualForm.getByLabel('JAN（8桁 / 13桁）').fill('4901234567894');
  await manualForm.getByRole('button', { name: '一覧に追加' }).click();

  const card = page.getByRole('listitem', {
    name: /本番確認商品 4901234567894/,
  });
  await card
    .getByRole('checkbox', { name: '商品名とJANを確認しました' })
    .check();
  await page
    .getByRole('button', { name: '確認済みのバーコードを表示（1件）' })
    .click();

  const barcodeScreen = page.getByRole('main', {
    name: 'JANバーコード表示',
  });
  await expect(barcodeScreen).toContainText('1 / 1');
  await expect
    .poll(() => barcodeScreen.locator('svg.barcode-svg rect').count())
    .toBeGreaterThan(10);

  expect(failedResponses).toEqual([]);
  expect(externalRequests).toEqual([]);
});
