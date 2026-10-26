import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const fixture = 'tests/fixtures/receipt-sample.png';
test.use({ locale: 'ja-JP' });

test('複数画像の比較・差分・IndexedDB再読込・履歴削除と320px表示', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => { if (request.url().startsWith('https://')) external.push(request.url()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'JAN確認画面を比較', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Google Cloud Vision', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Google Cloud Vision', exact: true })).toBeDisabled();
  const buffer = await readFile(fixture);
  await page.getByLabel('レシート画像を追加（複数選択可）').setInputFiles([
    { name: 'receipt-sample.png', mimeType: 'image/png', buffer },
    { name: 'second.png', mimeType: 'image/png', buffer },
  ]);
  for (const name of ['receipt-sample.png', 'second.png']) {
    await page.locator('.benchmark-sample').filter({ has: page.getByRole('checkbox', { name, exact: true }) }).getByText('正解データを入力して精度も測る（任意）').click();
    await page.getByLabel(`正解テキスト · ${name}`, { exact: true }).fill('牛肉\n4901234567894');
    await page.getByLabel(`商品名（1行1件）· ${name}`).fill('牛乳');
    await page.getByLabel(`JAN（1行1件・8桁/13桁）· ${name}`).fill('4901234567894');
  }
  await page.getByRole('button', { name: '選択した画像を一括比較' }).click();
  await expect(page.locator('.benchmark-live')).toContainText('比較が完了しました');
  await expect(page.locator('.benchmark-sample-results')).toHaveCount(2);
  await expect(page.locator('.benchmark-sample-results .benchmark-result-card')).toHaveCount(4);
  await expect(page.locator('.benchmark-sample-results').first().locator('.review-screen')).toHaveCount(2);
  await expect(page.locator('.benchmark-sample-results').first().locator('.review-screen .item-card')).toHaveCount(10);
  await expect(page.locator('.benchmark-sample-results').first().locator('details').filter({ hasText: '正解との差分' })).toHaveCount(2);
  await page.reload();
  await expect(page.getByLabel('正解テキスト · receipt-sample.png', { exact: true })).toHaveValue('牛肉\n4901234567894');
  await page.locator('.benchmark-history-row > button').first().click();
  await expect(page.locator('.benchmark-sample-results')).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('.benchmark-sample').filter({ has: page.getByRole('checkbox', { name: 'receipt-sample.png', exact: true }) }).getByRole('button', { name: '画像と関連履歴を削除' }).click();
  await expect(page.locator('.benchmark-history-row')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'second.png', exact: true })).toBeVisible();
  expect(external).toEqual([]);
});

test('正解入力なしで従来のJAN確認画面を2つ並べ、独立編集・履歴再表示できる', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('レシート画像を追加（複数選択可）').setInputFiles(fixture);
  await page.getByRole('button', { name: '選択した画像を一括比較' }).click();
  await expect(page.locator('.benchmark-live')).toContainText('比較が完了しました');
  await expect(page.locator('.benchmark-sample-results .benchmark-result-card')).toHaveCount(2);
  const panes = page.locator('.benchmark-sample-results .benchmark-result-card');
  await expect(panes.nth(0).locator('.review-screen .item-card')).toHaveCount(5);
  await expect(panes.nth(1).locator('.review-screen .item-card')).toHaveCount(5);
  await expect(panes.nth(0).getByText('4901234567894').first()).toBeVisible();
  await expect(panes.nth(1).getByText('4901234567894').first()).toBeVisible();
  const firstCard = panes.nth(0).locator('.item-card').first();
  await firstCard.getByRole('button', { name: /の内容を確認・編集/ }).first().click();
  await firstCard.getByLabel('JANコード（8桁・13桁）').fill('12345670');
  await expect(panes.nth(1).locator('.item-card').first().getByText('4901234567894')).toBeVisible();
  await expect(panes.nth(0).locator('.review-next-step')).toBeVisible();
  await expect(page.locator('.benchmark-sample-results')).toContainText('総所要');
  await expect(page.locator('.benchmark-sample-results')).not.toContainText('CER');
  await page.reload();
  await page.locator('.benchmark-history-row > button').first().click();
  await expect(page.locator('.benchmark-sample-results .review-screen')).toHaveCount(2);
  await expect(page.locator('.benchmark-sample-results .item-card')).toHaveCount(10);
});

test('広い画面でJAN確認画面を左右に並べ、片方の次へからバーコード表示と復帰ができる', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('./');
  await page.getByLabel('レシート画像を追加（複数選択可）').setInputFiles(fixture);
  await page.getByRole('button', { name: '選択した画像を一括比較' }).click();
  await expect(page.locator('.benchmark-live')).toContainText('比較が完了しました');
  const panes = page.locator('.benchmark-sample-results .benchmark-result-card');
  const left = await panes.nth(0).locator('.review-screen').boundingBox();
  const right = await panes.nth(1).locator('.review-screen').boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(right!.x).toBeGreaterThan(left!.x + left!.width);
  await panes.nth(0).getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.getByRole('main', { name: 'JANバーコード表示' })).toBeVisible();
  await page.getByRole('button', { name: '確認画面に戻る' }).click();
  await expect(panes.nth(0).locator('.review-screen')).toBeVisible();
  await expect(panes.nth(1).locator('.review-screen')).toBeVisible();
});

test('Googleは明示同意した実行だけ送信し、次回は同意し直す', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/dev/ocr-benchmark/vision', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true } });
    posts += 1;
    expect(route.request().headers()['x-ocr-consent']).toBe('vision-online-v1');
    expect(route.request().headers()['content-type']).toBe('image/png');
    expect(route.request().postDataBuffer()?.length).toBeGreaterThan(0);
    return route.fulfill({ json: { text: '牛乳' } });
  });
  await page.goto('./');
  await page.getByLabel('レシート画像を追加（複数選択可）').setInputFiles(fixture);
  await page.locator('.benchmark-sample summary').click();
  await page.getByLabel('正解テキスト · receipt-sample.png', { exact: true }).fill('牛乳');
  await page.getByRole('checkbox', { name: 'Tesseract.js 7', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'PaddleOCR.js', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Google Cloud Vision', exact: true }).check();
  const start = page.getByRole('button', { name: '選択した画像を一括比較' });
  await expect(start).toBeDisabled();
  expect(posts).toBe(0);
  const consent = page.getByRole('checkbox', { name: '条件を確認し、この比較で選択中の画像をGoogleに送信することに同意します' });
  await consent.check();
  await start.click();
  await expect(page.locator('.benchmark-live')).toContainText('比較が完了しました');
  expect(posts).toBe(1);
  await expect(consent).not.toBeChecked();
  await expect(start).toBeDisabled();
});
