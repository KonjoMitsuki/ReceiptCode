import { expect, test, type Page, type Locator } from '@playwright/test';
import path from 'node:path';

const fixtureImage = path.resolve('tests/fixtures/receipt-sample.png');
const cardFor = (page: Page, name: string) => page.getByRole('listitem', { name: new RegExp(name) });
const openMenu = (page: Page) => page.getByLabel('その他の操作').click();
async function openApp(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'レシートを読み取る' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/receipt2jan/');
}
async function startManual(page: Page) {
  await openMenu(page);
  await page.getByRole('button', { name: 'JANを手入力して始める' }).click();
}
async function addItem(page: Page, name: string, jan: string) {
  await page.getByLabel('商品名', { exact: true }).fill(name);
  await page.getByLabel('JANコード（8桁・13桁）').fill(jan);
  await page.getByRole('button', { name: '商品を追加する' }).click();
}
async function confirmCard(card: Locator) {
  await card.getByRole('button', { name: /の内容を確認・編集/ }).click();
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: /の内容を確認・編集/ }).click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test('OCR結果の編集・確認・選択商品の表示・前後移動・集中表示を維持する', async ({ page }) => {
  await openApp(page);
  const externalRequests: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.locator('#receipt-image-input').setInputFiles(fixtureImage);
  await expect(page.getByRole('heading', { name: '画像を確認' })).toBeVisible();
  await expect(page.getByRole('img', { name: '選択したレシート画像のプレビュー' })).toHaveJSProperty('complete', true);
  await page.getByRole('button', { name: 'この画像で読み取る' }).click();
  await expect(page.getByRole('progressbar', { name: 'OCRの進捗' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '読み取りが完了しました' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.item-card')).toHaveCount(5);
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(4);
  await cardFor(page, 'ヨーグルト').getByRole('checkbox').uncheck();
  await cardFor(page, 'りんご').getByRole('checkbox').uncheck();
  const milk = cardFor(page, '牛乳 1L');
  const bread = cardFor(page, '食パン 8枚切');
  const banana = cardFor(page, 'バナナ');
  await milk.getByRole('button', { name: /の内容を確認・編集/ }).click();
  await expect(milk.getByLabel('JANコード（8桁・13桁）')).toHaveValue('4901234567894');
  await expect(milk).toContainText('同じJANが他に1件あります');
  await milk.getByLabel('商品名', { exact: true }).fill('牛乳 1L 確認');
  await milk.getByRole('checkbox').check();
  await milk.getByRole('button', { name: /の内容を確認・編集/ }).click();
  await banana.getByRole('button', { name: /の内容を確認・編集/ }).click();
  await expect(banana.getByRole('checkbox')).toBeDisabled();
  await expect(banana).toContainText('チェックデジットが一致しません');
  await confirmCard(bread);
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.getByRole('img', { name: 'EAN13 バーコード 4901234567894' })).toBeVisible();
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'EAN13 バーコード 4512345678906' })).toBeVisible();
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '前へ', exact: true }).click();
  await expect(page.getByRole('heading', { name: '牛乳 1L 確認' })).toBeVisible();
  await page.getByRole('button', { name: '全画面で表示' }).click();
  await expect(page.locator('.barcode-screen')).toHaveClass(/is-focus/);
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.locator('.focus-name')).toHaveText('食パン 8枚切');
  await page.getByRole('button', { name: '集中表示を終了' }).click();
  await page.getByRole('button', { name: '確認画面に戻る' }).click();
  await milk.getByRole('button', { name: /の内容を確認・編集/ }).click();
  await expect(milk.getByRole('checkbox')).toBeChecked();
  expect(externalRequests).toEqual([]);
});

test('JAN候補なしから手動追加で復帰する', async ({ page }) => {
  await page.goto('./?fixture=empty');
  await page.locator('#receipt-image-input').setInputFiles(fixtureImage);
  await page.getByRole('button', { name: 'この画像で読み取る' }).click();
  await expect(page.getByRole('heading', { name: '商品を追加' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByRole('heading', { name: 'JAN候補を検出できませんでした' })).toBeVisible();
  await page.getByRole('button', { name: '＋ 商品を手動追加' }).click();
  await addItem(page, '手入力復帰商品', '4901234567894');
  const card = cardFor(page, '手入力復帰商品');
  await confirmCard(card);
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.getByRole('img', { name: 'EAN13 バーコード 4901234567894' })).toBeVisible();
});

test('不正JANを拒否し、EAN-13とEAN-8を一括表示できる', async ({ page }) => {
  await openApp(page);
  await startManual(page);
  await addItem(page, 'テスト商品', '4901234567890');
  await expect(page.getByRole('alert')).toContainText('チェックデジットが一致しません。期待値は 4 です。');
  await expect(page.locator('.item-card')).toHaveCount(0);
  await addItem(page, 'テスト商品', '4901234567894');
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeEnabled();
  await cardFor(page, 'テスト商品').getByRole('checkbox').uncheck();
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '＋ 商品を手動追加' }).click();
  await addItem(page, '8桁商品', '12345670');
  await confirmCard(cardFor(page, 'テスト商品'));
  await confirmCard(cardFor(page, '8桁商品'));
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.getByRole('img', { name: 'EAN13 バーコード 4901234567894' })).toBeVisible();
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.getByRole('img', { name: 'EAN8 バーコード 12345670' })).toBeVisible();
  expect(await page.locator('.barcode-svg rect').count()).toBeGreaterThan(10);
});

test('320pxと横向きで操作とバーコードが収まる', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openApp(page);
  const box = await page.locator('.upload-button').boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
  await noOverflow(page);
  await startManual(page);
  await addItem(page, '横向き確認商品', '4901234567894');
  const card = cardFor(page, '横向き確認商品');
  await confirmCard(card);
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  const svg = await page.locator('.barcode-svg').boundingBox();
  expect(svg?.width).toBeGreaterThan(150);
  expect((svg?.x ?? 0) + (svg?.width ?? 0)).toBeLessThanOrEqual(844);
  await noOverflow(page);
  await expect(page.getByRole('button', { name: '確認画面に戻る' })).toBeVisible();
});

test('追加の戻る操作で確認状態を保持し、長い商品名でもはみ出さない', async ({ page }) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    await openApp(page);
    await noOverflow(page);
    await startManual(page);
    await noOverflow(page);
    await addItem(page, '長い商品名と先頭ゼロを保持する商品 500ml', '0123456789012');
    const card = cardFor(page, '長い商品名');
    await confirmCard(card);
    await noOverflow(page);
    await page.getByRole('button', { name: '＋ 商品を手動追加' }).click();
    await page.getByRole('button', { name: '‹ 商品一覧' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await page.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(page.getByRole('img', { name: 'EAN13 バーコード 0123456789012' })).toBeVisible();
    await noOverflow(page);
    page.once('dialog', dialog => void dialog.accept());
  }
});

test('写真追加とバーコードは各端末でスクロールせず操作できる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.evaluate(() => document.fonts.ready);
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    await expect(page.locator('.app')).toHaveCSS('border-radius', '0px');
  };
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await fits();
    await expect(page.locator('.upload-button')).toBeInViewport({ ratio: 1 });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page.getByText('9:41', { exact: true })).toHaveCount(0);

  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'JANを手入力して始める' })).toHaveCount(0);
  await startManual(page);
  for (const [i, name, jan] of [[0, '緑茶 500ml', '4901234567894'], [1, 'ミネラルウォーター', '4901234560017'], [2, 'チョコレート', '4909876543214']] as const) {
    if (i) await page.getByRole('button', { name: '＋ 商品を手動追加' }).click();
    await addItem(page, name, jan);
    if (i < 2) await confirmCard(cardFor(page, name));
  }
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await fits();
    for (const name of ['前へ', '次へ', '全画面で表示', '確認画面に戻る']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      const buttonBox = (await button.boundingBox())!;
      const handleBox = (await page.locator('.product-sheet-handle').boundingBox())!;
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(handleBox.y);
    }
    await expect(page.locator('.barcode-svg')).toBeInViewport({ ratio: 1 });
  }
  await expect(page.getByRole('button', { name: '一覧に戻る' })).toHaveCount(0);
});

test('選択件数と次へがスクロール中も画面下に残り、一覧末尾を隠さない', async ({ page }) => {
  await openApp(page);
  await page.locator('#receipt-image-input').setInputFiles(fixtureImage);
  await page.getByRole('button', { name: 'この画像で読み取る' }).click();
  await expect(page.getByRole('heading', { name: '読み取りが完了しました' })).toBeVisible({ timeout: 15_000 });
  const footer = page.getByRole('region', { name: 'バーコード表示へ進む' });
  await expect(footer).toContainText('4件');
  await expect(cardFor(page, 'バナナ').getByRole('checkbox')).toBeDisabled();
  for (const [width, height] of [[320, 568], [390, 844], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    for (const end of [false, true]) {
      await page.evaluate(end => window.scrollTo(0, end ? document.documentElement.scrollHeight : 0), end);
      await expect(footer.getByRole('button', { name: '次へ' })).toBeInViewport();
      const bounds = await footer.boundingBox();
      expect(Math.abs(bounds!.y + bounds!.height - height)).toBeLessThanOrEqual(1);
      if (end) {
        const add = await page.getByRole('button', { name: '＋ 商品を手動追加' }).boundingBox();
        expect(add!.y + add!.height).toBeLessThanOrEqual(bounds!.y);
      }
    }
    await noOverflow(page);
  }
  await cardFor(page, '食パン').getByRole('checkbox').uncheck();
  await expect(footer).toContainText('3件');
});

test('商品シートを半分まで引き上げ、選んだ商品へジャンプして前後移動を続ける', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await startManual(page);
  await addItem(page, '商品A', '4901234567894');
  await page.getByRole('button', { name: '＋ 商品を手動追加' }).click();
  await addItem(page, '商品B', '12345670');
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  const sheet = page.getByRole('region', { name: 'バーコードの商品リスト' });
  const handle = sheet.getByRole('button', { name: '商品リストを開く' });
  await expect(handle).toBeInViewport();
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 340, { steps: 12 });
  await page.mouse.up();
  await expect(sheet.getByRole('button', { name: '商品リストを閉じる' })).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(422);
  await expect(sheet.getByRole('button', { name: /商品A/ })).toHaveAttribute('aria-current', 'true');
  await sheet.getByRole('button', { name: /商品B/ }).click();
  await expect(page.getByRole('img', { name: 'EAN8 バーコード 12345670' })).toBeVisible();
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '商品リストを開く' })).toBeVisible();
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '前へ', exact: true }).click();
  await expect(page.getByRole('img', { name: 'EAN13 バーコード 4901234567894' })).toBeVisible();
  await sheet.getByRole('button', { name: '商品リストを開く' }).click();
  await sheet.getByRole('button', { name: '商品リストを閉じる' }).press('Escape');
  await expect(sheet.getByRole('button', { name: '商品リストを開く' })).toBeFocused();
});
