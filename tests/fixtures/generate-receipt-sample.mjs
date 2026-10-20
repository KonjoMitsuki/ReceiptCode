/**
 * 架空レシート画像の再生成スクリプト。
 * 実在店舗のレシートや顧客情報は使用しない。
 *
 *   node tests/fixtures/generate-receipt-sample.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'receipt-sample.png');

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; width: 900px; height: 1400px; background: #b7b1a6; }
  body {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    font-family: "IPAPGothic", "WenQuanYi Zen Hei", sans-serif;
  }
  .paper {
    width: 700px;
    min-height: 1300px;
    margin-top: 38px;
    padding: 42px 44px 34px;
    background: #ffffff;
    color: #111111;
    box-sizing: border-box;
  }
  h1 { margin: 0 0 8px; font-size: 38px; text-align: center; letter-spacing: 2px; }
  .meta { margin: 3px 0; font-size: 21px; text-align: center; }
  .rule { margin: 20px 0; border-top: 2px dashed #777; }
  .row { display: flex; justify-content: space-between; gap: 18px; margin: 12px 0; font-size: 27px; }
  .name { font-weight: 700; }
  .code { margin: 2px 0 14px; font-family: "DejaVu Sans Mono", monospace; font-size: 30px; letter-spacing: 2px; }
  .small { font-size: 20px; }
  .total { font-size: 31px; font-weight: 700; }
  .thanks { margin-top: 34px; font-size: 22px; text-align: center; }
</style>
</head>
<body>
  <div class="paper">
    <h1>サンプルマート 駅前店</h1>
    <p class="meta">2026年10月20日(火) 12:34</p>
    <p class="meta">レジ 03 担当 佐藤</p>
    <div class="rule"></div>

    <div class="row"><span class="name">牛乳 1L</span><span>198円</span></div>
    <div class="code">4901234567894</div>

    <div class="row"><span class="name">食パン 8枚切</span><span>298円</span></div>
    <div class="code">4512345678906</div>

    <div class="row"><span class="name">ヨーグルト 400g</span><span>158円</span></div>
    <div class="code">12345670</div>

    <div class="row"><span class="name">りんご 1個</span><span>198円</span></div>
    <div class="code">4901234567894</div>

    <div class="row"><span class="name">バナナ</span><span>128円</span></div>
    <div class="code">4901234567890</div>

    <div class="rule"></div>
    <div class="row total"><span>合計</span><span>1,058円</span></div>
    <div class="row"><span>お預り</span><span>2,000円</span></div>
    <div class="row"><span>お釣</span><span>942円</span></div>
    <div class="rule"></div>
    <p class="meta small">TEL 03-1234-5678</p>
    <p class="meta small">会員番号 12345670</p>
    <p class="thanks">ご来店ありがとうございました</p>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: output, fullPage: true });
await browser.close();

console.log(`generated: ${output}`);
