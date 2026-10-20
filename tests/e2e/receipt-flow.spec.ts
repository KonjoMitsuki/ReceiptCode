import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const fixtureImage = path.resolve('tests/fixtures/receipt-sample.png');

async function openApp(page: Page) {
  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: /レシートから\s*JANを読み取る/ }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/receipt2jan/');
}

async function uploadFixture(page: Page) {
  await page.locator('#receipt-image-input').setInputFiles(fixtureImage);
  await expect(
    page.getByRole('heading', { name: '画像を確認' }),
  ).toBeVisible();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function itemCard(page: Page, name: string) {
  return page.getByRole('listitem', {
    name: new RegExp(escapeRegExp(name)),
  });
}

test('画像アップロードから確認、バーコード切り替えまで進める', async ({
  page,
}) => {
  await openApp(page);

  const appOrigin = new URL(page.url()).origin;
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) {
      externalRequests.push(request.url());
    }
  });

  await uploadFixture(page);

  const preview = page.getByRole('img', {
    name: '選択したレシート画像のプレビュー',
  });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty('complete', true);

  await page.getByRole('button', { name: 'この画像で読み取る' }).click();
  await expect(
    page.getByRole('heading', { name: 'レシートを読み取っています' }),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'OCRの進捗' }),
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: '読み取り結果' }),
  ).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('.item-card')).toHaveCount(5);
  await expect(page.locator('.summary-row')).toContainText('有効 2');
  await expect(page.locator('.summary-row')).toContainText('要確認 2');
  await expect(page.locator('.summary-row')).toContainText('無効 1');

  const milk = itemCard(page, '牛乳 1L');
  const bread = itemCard(page, '食パン 8枚切');
  const yogurt = itemCard(page, 'ヨーグルト 400g');
  const apple = itemCard(page, 'りんご 1個');
  const banana = itemCard(page, 'バナナ');

  await expect(
    milk.getByRole('textbox', { name: 'JAN（8桁 / 13桁）' }),
  ).toHaveValue('4901234567894');
  await expect(milk).toContainText('同じJANが他に1件あります');
  await expect(
    bread.getByRole('textbox', { name: 'JAN（8桁 / 13桁）' }),
  ).toHaveValue('4512345678906');
  await expect(yogurt).toContainText('要確認');
  await expect(apple).toContainText('同じJANが他に1件あります');
  await expect(banana).toContainText('無効');
  await expect(banana).toContainText('チェックデジットが一致しません');

  const bananaCheckbox = banana.getByRole('checkbox', {
    name: '商品名とJANを確認しました',
  });
  await expect(bananaCheckbox).toBeDisabled();
  await expect(
    banana.getByRole('button', { name: 'バーコードを表示' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: '確認済みのバーコードを表示（0件）',
    }),
  ).toBeDisabled();

  await milk
    .getByRole('checkbox', { name: '商品名とJANを確認しました' })
    .check();
  await bread
    .getByRole('checkbox', { name: '商品名とJANを確認しました' })
    .check();

  await expect(page.locator('.summary-row')).toContainText('確認済み 2');
  await page
    .getByRole('button', { name: '確認済みのバーコードを表示（2件）' })
    .click();

  const barcodeScreen = page.getByRole('main', {
    name: 'JANバーコード表示',
  });
  await expect(barcodeScreen).toBeVisible();
  await expect(barcodeScreen).toContainText('1 / 2');
  await expect(
    barcodeScreen.getByRole('heading', { name: '牛乳 1L' }),
  ).toBeVisible();
  await expect(barcodeScreen).toContainText('4901234567894');
  await expect(
    barcodeScreen.getByRole('button', { name: '前へ' }),
  ).toBeDisabled();
  await expect(
    barcodeScreen.getByRole('button', { name: '次へ' }),
  ).toBeEnabled();

  const barcodeSvg = barcodeScreen.locator('svg.barcode-svg');
  await expect(barcodeSvg).toBeVisible();
  await expect
    .poll(() => barcodeSvg.locator('rect').count())
    .toBeGreaterThan(10);

  await barcodeScreen
    .getByRole('button', { name: '集中表示' })
    .click();
  await expect(barcodeScreen).toHaveClass(/is-focus/);
  await expect(
    barcodeScreen.getByRole('button', { name: '集中表示を終了' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(barcodeScreen.locator('.focus-name')).toHaveText('牛乳 1L');

  await barcodeScreen.getByRole('button', { name: '次へ' }).click();
  await expect(barcodeScreen).toContainText('2 / 2');
  await expect(barcodeScreen.locator('.focus-name')).toHaveText(
    '食パン 8枚切',
  );
  await expect(
    barcodeScreen.getByRole('button', { name: '次へ' }),
  ).toBeDisabled();

  await barcodeScreen
    .getByRole('button', { name: '集中表示を終了' })
    .click();
  await expect(barcodeScreen).not.toHaveClass(/is-focus/);
  await expect(
    barcodeScreen.getByRole('heading', { name: '食パン 8枚切' }),
  ).toBeVisible();

  await barcodeScreen.getByRole('button', { name: '前へ' }).click();
  await expect(barcodeScreen).toContainText('1 / 2');
  await expect(barcodeScreen).toContainText('4901234567894');

  await barcodeScreen.getByRole('button', { name: '一覧に戻る' }).click();
  await expect(
    page.getByRole('heading', { name: '読み取り結果' }),
  ).toBeVisible();
  await expect(milk.getByRole('checkbox')).toBeChecked();

  expect(externalRequests).toEqual([]);
});

test('OCRでJAN候補なしのとき、手入力でバーコード表示まで復帰する', async ({
  page,
}) => {
  await page.goto('./?fixture=empty');
  await expect(
    page.getByRole('heading', { name: /レシートから\s*JANを読み取る/ }),
  ).toBeVisible();
  await uploadFixture(page);

  await page.getByRole('button', { name: 'この画像で読み取る' }).click();
  await expect(
    page.getByRole('heading', { name: '読み取り結果' }),
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    page.getByRole('heading', { name: 'JAN候補を検出できませんでした' }),
  ).toBeVisible();
  await expect(page.locator('.item-card')).toHaveCount(0);

  const manualForm = page.getByRole('form', {
    name: 'JANを手入力で追加',
  });
  await manualForm.getByLabel('商品名（任意）').fill('手入力復帰商品');
  await manualForm.getByLabel('JAN（8桁 / 13桁）').fill('4901234567894');
  await manualForm.getByRole('button', { name: '一覧に追加' }).click();

  const card = page.getByRole('listitem', {
    name: /手入力復帰商品 4901234567894/,
  });
  await expect(card).toBeVisible();
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
  await expect(barcodeScreen).toContainText('4901234567894');
  await expect
    .poll(() => barcodeScreen.locator('svg.barcode-svg rect').count())
    .toBeGreaterThan(10);
});

test('手入力でEAN-13とEAN-8を追加し、不正JANを拒否する', async ({
  page,
}) => {
  await openApp(page);
  await page
    .getByRole('button', { name: 'JANを手入力して始める' })
    .click();

  const manualForm = page.getByRole('form', {
    name: 'JANを手入力で追加',
  });

  await manualForm.getByLabel('商品名（任意）').fill('テスト商品');
  await manualForm.getByLabel('JAN（8桁 / 13桁）').fill('4901234567890');
  await manualForm.getByRole('button', { name: '一覧に追加' }).click();
  await expect(manualForm.getByRole('alert')).toContainText(
    'チェックデジットが一致しません。期待値は 4 です。',
  );
  await expect(page.locator('.item-card')).toHaveCount(0);

  await manualForm.getByLabel('JAN（8桁 / 13桁）').fill('4901234567894');
  await manualForm.getByRole('button', { name: '一覧に追加' }).click();

  const ean13Card = page
    .getByRole('listitem', { name: /テスト商品 4901234567894/ });
  await expect(ean13Card).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: '確認済みのバーコードを表示（0件）',
    }),
  ).toBeDisabled();

  await page
    .getByRole('button', { name: '＋ 手入力で商品を追加' })
    .click();
  const secondManualForm = page.getByRole('form', {
    name: 'JANを手入力で追加',
  });
  await secondManualForm.getByLabel('商品名（任意）').fill('8桁商品');
  await secondManualForm
    .getByLabel('JAN（8桁 / 13桁）')
    .fill('12345670');
  await secondManualForm
    .getByRole('button', { name: '一覧に追加' })
    .click();

  const ean8Card = page.getByRole('listitem', { name: /8桁商品 12345670/ });
  await expect(ean8Card).toBeVisible();
  await expect(ean8Card).toContainText('有効');

  for (const card of [ean13Card, ean8Card]) {
    await card
      .getByRole('checkbox', { name: '商品名とJANを確認しました' })
      .check();
  }

  await page
    .getByRole('button', { name: '確認済みのバーコードを表示（2件）' })
    .click();
  const barcodeScreen = page.getByRole('main', {
    name: 'JANバーコード表示',
  });
  await expect(barcodeScreen).toContainText('1 / 2');
  await expect
    .poll(() => barcodeScreen.locator('svg.barcode-svg rect').count())
    .toBeGreaterThan(10);
  await expect(barcodeScreen).toContainText('JAN-13（EAN-13）');

  await barcodeScreen.getByRole('button', { name: '次へ' }).click();
  await expect(barcodeScreen).toContainText('2 / 2');
  await expect(barcodeScreen).toContainText('12345670');
  await expect(barcodeScreen).toContainText('JAN-8（EAN-8）');
  await expect
    .poll(() => barcodeScreen.locator('svg.barcode-svg rect').count())
    .toBeGreaterThan(10);
});

test('320px幅と横向きで主要操作が画面内に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openApp(page);

  const uploadButton = page.locator('label.upload-button');
  const box = await uploadButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);

  const uploadOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(uploadOverflow).toBeLessThanOrEqual(1);

  await page
    .getByRole('button', { name: 'JANを手入力して始める' })
    .click();
  await page.getByLabel('商品名（任意）').fill('横向き確認商品');
  await page.getByLabel('JAN（8桁 / 13桁）').fill('4901234567894');
  await page.getByRole('button', { name: '一覧に追加' }).click();

  const card = page.getByRole('listitem', {
    name: /横向き確認商品 4901234567894/,
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
  await expect(barcodeScreen).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });

  const svgBox = await barcodeScreen.locator('svg.barcode-svg').boundingBox();
  expect(svgBox).not.toBeNull();
  expect(svgBox?.width).toBeGreaterThan(150);
  expect((svgBox?.x ?? 0) + (svgBox?.width ?? 0)).toBeLessThanOrEqual(844);

  const barcodeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(barcodeOverflow).toBeLessThanOrEqual(1);

  await expect(
    barcodeScreen.getByRole('button', { name: '一覧に戻る' }),
  ).toBeVisible();
});
