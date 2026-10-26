import { expect, test } from '@playwright/test';

const previewBaseURL = 'http://127.0.0.1:4175/receipt2jan/';

test.use({ baseURL: previewBaseURL });

for (const basePath of ['/', '/receipt2jan/']) {
test(`本番ビルドを ${basePath} で配信し、手入力フローが動く`, async ({
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

  await page.goto(`http://127.0.0.1:4175${basePath}`);
  await expect(
    page.getByRole('heading', { name: 'レシートを読み取る' }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(basePath);

  // CSSが読み込まれていること（未適用時のbody背景は白）。
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe('rgb(247, 247, 255)');

  await page.getByLabel('その他の操作').click();
  await page
    .getByRole('button', { name: 'JANを手入力して始める' })
    .click();
  const manualForm = page.getByRole('form', {
    name: '商品を追加',
  });
  await manualForm.getByLabel('商品名').fill('本番確認商品');
  await manualForm.getByLabel('JANコード（8桁・13桁）').fill('4901234567894');
  await manualForm.getByRole('button', { name: '商品を追加する' }).click();

  const card = page.getByRole('listitem', {
    name: /本番確認商品 4901234567894/,
  });
  await card.getByRole('button', { name: /の内容を確認・編集/ }).click();
  await card
    .getByRole('checkbox', { name: '商品名とJANを確認しました' })
    .check();
  await page.getByRole('button', { name: '次へ', exact: true }).click();

  const barcodeScreen = page.getByRole('main', {
    name: 'JANバーコード表示',
  });
  await expect
    .poll(() => barcodeScreen.locator('svg.barcode-svg rect').count())
    .toBeGreaterThan(10);

  expect(failedResponses).toEqual([]);
  expect(externalRequests).toEqual([]);
});

}

for (const basePath of ['/', '/receipt2jan/']) {
  test(`本番の比較ページを ${basePath}dev/ocr-benchmark/ から直接開ける`, async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (response) => { if (response.status() >= 400 && !response.url().includes('/api/dev/')) failures.push(response.url()); });
    await page.goto(`http://127.0.0.1:4175${basePath}dev/ocr-benchmark/`);
    await expect(page.getByRole('heading', { name: 'OCR Benchmark', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Google Cloud Vision', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Tesseract.js 7', exact: true })).toBeEnabled();
    await page.getByRole('link', { name: '← 通常の読み取りへ' }).click();
    await expect(page.getByRole('heading', { name: 'レシートを読み取る' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(basePath);
    expect(failures).toEqual([]);
  });
}
