# ReceiptCode（Receipt2JAN）

店舗スタッフがレシートを撮影し、印字された **JAN（EAN-13 / EAN-8）** を端末内OCRで読み取り、レジのハンディスキャナーで使える **SVGバーコード** を表示する静的Webアプリです。

- プロジェクト名: **Receipt2JAN**
- 対象端末: iPhone Safari / Android Chrome（店舗業務での私物端末利用は店舗管理者の許可を得てください）
- 配信: GitHub Pages（公開URL: <https://konjomitsuki.github.io/ReceiptCode/>、サブパス配信に対応）
- **サーバー処理・ログイン・DB・外部OCR APIはありません。**レシート画像とOCR結果は端末のブラウザ内だけで処理します。

> [!IMPORTANT]
> **実機検証は未完了です。**
> iPhone Safari / Android Chrome の実機、およびハンディスキャナーで画面の EAN-13 / EAN-8 を読み取る検証は行っていません。README の「未検証・既知の制約」を必ず確認してください。

## Material Design 3 UI

Figmaの4画面（レシート選択・読み取り結果・バーコード表示・手動追加）を既存のReact / TypeScript / CSSで実装しています。OCR、JAN検証、画像プレビュー、商品編集・確認・削除、一括表示、前後移動、集中表示は既存処理へ接続し、依存ライブラリの追加はありません。

- [画面・既存機能の対応表と実装判断](docs/Material3_Implementation.md)
- [実装画面のスクリーンショット](docs/Material3_Implementation.md#画面の比較資料)
- 有効なJANは初期チェック済みで表示されます。確認画面で必要に応じて選択を外し、下部に固定された件数と「次へ」から次の画面へ進み、「次へ」で一覧順に連続表示します。商品名や「▤」のタップは編集専用です。
- 「＋ 商品を手動追加」は独立した追加画面を開きます。キャンセル・戻るで既存の商品を保持します。
- 「全画面で表示」は集中表示を開始し、対応ブラウザでは全画面化します。
- 手入力開始・再OCRは「⋮」メニューから使えます。件数・「次へ」を一覧画面の下端に固定し、バーコード画面の「前へ／次へ」も常時表示して、確認→連続スキャンの運用に合わせています。
- Figmaと同じ390×844を基準に、Interフォント・色・寸法・余白を再現しています。フォントはアプリ内に同梱しています。

2026-10-25の確認: lint・型チェック・68件の単体/コンポーネントテスト・9件のE2E・本番ビルドが成功。E2Eは固定OCRエンジンを使用し、実機/スキャナーの確認は未実施です。

## 現在の実装範囲

設計仕様書の **Phase 0（セットアップ）と Phase 1（MVP）** までを実装しています。

実装済み:

- レシート画像の撮影 / 選択、プレビュー（EXIF向き補正、縮小、JPEG化、白背景）
- ブラウザ内OCR（Tesseract.js、進捗表示、キャンセル、再試行、ジョブ競合防止）
- OCRテキストからのJAN-13 / JAN-8候補抽出、チェックデジット検証
- 近接行からの商品名推定（不確実な場合は「要確認」）
- 結果一覧、商品名 / JAN の編集、確認チェック、行削除、手入力追加
- 確認済みかつチェックデジット有効なJANのみEAN-13 / EAN-8のSVGバーコード表示
- 前へ / 次へ、集中表示、Wake Lock（対応環境のみ）、JAN数字の表示
- モバイル向けUI（320px幅、横向き、44×44 CSS px目安）
- 単体 / コンポーネント / E2Eテスト、CI、GitHub Pages配信ワークフロー

未実装（P1/P2。前倒ししていません）:

- 端末内履歴（IndexedDB）、検索・削除
- PWA / オフラインキャッシュ / ホーム画面追加
- 画像の回転・台形補正・トリミング・コントラスト補正
- 数字専用OCRの二段階処理、OCR bounding boxを使った高精度対応付け
- ダークモード、スキャナー別ガイド、OCR精度評価画面
- 共有機能、商品マスタ連携、POS連携

## 動作環境

- Node.js 22.12.0 以上（開発・ビルド用）
- npm
- 実行はモダンブラウザ。iOS Safari / Android Chrome を想定しています。
- 初回OCR時に Tesseract.js の worker / core / 言語データをCDNから取得するため、ネットワーク接続が必要です（画像は送信しません）。

## セットアップと起動

```bash
npm ci
npm run dev
```

開発サーバーは既定で GitHub Pages のサブパス `/receipt2jan/` を `base` にします。

- 開発: `http://localhost:5173/receipt2jan/`
- プレビュー: `npm run build && npm run preview` → `http://localhost:4173/`

本番ビルドの既定値は相対パス `./` で、Cloudflare Pagesのルートとサブパスの両方へ配信できます。開発時の既定値は `/receipt2jan/` です。

`BASE_PATH` 環境変数で `base` を変更できます（末尾スラッシュは自動補完）。

```bash
BASE_PATH=/my-repo/ npm run build
```

### npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 型チェック + 本番ビルド（`dist/`） |
| `npm run preview` | `dist/` のプレビュー |
| `npm run dev:e2e` | E2E用モードで開発サーバー起動（`.env.e2e`） |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict の型チェック |
| `npm test` | 単体・コンポーネントテスト（Vitest） |
| `npm run test:watch` | Vitest ウォッチ |
| `npm run test:e2e` | Playwright E2E（初回は `npx playwright install --with-deps chromium`） |

### E2Eテスト

`tests/e2e` は `.env.e2e` の `VITE_E2E_OCR=true` で起動し、実際のOCRの代わりに固定のOCR結果を使います。OCR資材のダウンロードなしで、次の流れを検証します。

1. 画像アップロード → OCR進捗 → 結果表示
2. 商品名の確認 → バーコード表示 → 前後移動 → 集中表示
3. OCRでJAN候補なし → 手入力での復帰
4. 不正JANの拒否、手入力でのEAN-13 / EAN-8追加
5. 320px幅・横向き表示、サブパス配信、外部送信がないこと
6. 本番ビルドを `/receipt2jan/` でプレビュー配信し、静的資産と手入力フローが動くこと

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

## 使い方

1. 「＋ 画像を選択」からレシート画像を選びます。
2. 画像を確認し、「この画像で読み取る」を押します。
3. 読み取り結果で商品名とJANを確認・修正します。
   - **有効**: チェックデジットが一致。ただし実商品との一致は未確認です。
   - **要確認**: JAN-8、区切り数字の連結、同じ行の複数候補、商品名の対応が不確実など。内容を確認すればバーコード表示できます。
   - **無効**: 桁数・数字以外・チェックデジット不一致。修正するまで確認・バーコード表示はできません。
4. 有効なJANは初期チェック済みです。商品名とJANを確認し、対象外にする商品はチェックを外します。無効なJANは修正するまで選択できません。
5. 一覧下端に固定された「次へ」を押すと、確認済み商品のSVGバーコードをまとめて表示します。
6. 複数商品は画面の「前へ」「次へ」で切り替えます。「全画面で表示」で集中表示に切り替えられます。読み取れない場合は画面のJAN数字をレジに手入力してください。

同じJANが複数ある場合も、別明細や数量違いの可能性があるため自動で統合・削除しません。必要に応じて人間が判断してください。

## プライバシーと外部通信

- レシート画像、OCR原文、JAN候補、商品名は外部サーバーへ送信しません。
- OCRは Tesseract.js の Web Worker として端末のブラウザ内で実行します。
- 画像処理は Canvas / `createImageBitmap` で行い、処理後の画像もブラウザ内メモリにのみ保持します。
- 画像を含むフォーム送信、アップロード機能、解析SDK、広告SDKはありません。
- P0では履歴を保存しません。画面を再読み込みすると内容は失われます（結果がある状態で離脱する際は確認ダイアログが出ます）。

初回OCR時のみ、Tesseract.js の既定CDN（jsDelivr）から次の資材を取得します。画像データは含まれません。

| 資材 | 取得元の例 |
|---|---|
| Tesseract worker | `https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js` |
| Tesseract core | `https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/...`（ブラウザのSIMD対応に応じて選択） |
| 日本語OCRデータ | `https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz` |
| 英数字OCRデータ | `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz` |

2回目以降も新しいOCRごとにworkerを生成・終了しますが、言語データ等はブラウザのHTTPキャッシュを利用します。P1で同一オリジン配信・オフラインキャッシュを検討します。

## 技術構成

| 領域 | 採用 |
|---|---|
| 言語 | TypeScript 5.9.3（strict） |
| UI | React 19.3.1 + Vite 8.3.4 |
| OCR | Tesseract.js 7.0.0（`jpn` + `eng`） |
| バーコード | JsBarcode 3.12.3（SVG、EAN-13 / EAN-8） |
| テスト | Vitest 5.0.5 + React Testing Library / Playwright 1.64.1 |
| 静的配信 | GitHub Pages（プロジェクトページのサブパス） |
| 永続化 | なし（P0。P1でIndexedDBを想定） |

依存ライブラリは `package-lock.json` で固定しています。主なライセンスは React / Vite / JsBarcode が MIT、Tesseract.js が Apache-2.0 です。Tesseract.js の言語データは各配布元のライセンスに従います。

## GitHub Pagesへの配布

`.github/workflows/deploy.yml` が `main` へのpush時にビルドし、Pagesへ配信します。

現在の公開URLは **<https://konjomitsuki.github.io/ReceiptCode/>** です。2026-10-20 に GitHub Actions でデプロイし、公開URL上で手入力からEAN-13バーコード表示まで確認しています。

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします（「Deploy from a branch」ではビルド済みの `dist` が配信されません）。
2. `main` にpushします。
3. ワークフロー内で `BASE_PATH=/${{ github.event.repository.name }}/` を渡すため、リポジトリ名のサブパスで配信されます。

既定の `base` は `/receipt2jan/` です。ローカルで別名のリポジトリに配布する場合は `BASE_PATH` を明示してください。アプリはルーターを使わない単一画面の状態遷移のみで、サブパス直下で動作します。

## 設計上の判断

- **JAN検証をUIから独立した純粋関数**（`src/lib/jan.ts`）にしています。入力は常に文字列として扱い、数値型へ変換しません（先頭ゼロを保持）。
- チェックデジットが有効でも「実商品と一致」は保証しません。チェックデジットが有効な項目は初期チェック済みにし、一覧で選択された有効な項目だけバーコード表示できます。商品名や番号を編集した場合はチェックを解除します。
- `needs-review` は、JAN-8、区切り数字の連結、同一行の複数候補、商品名対応が不確実な場合に付けます。人間が内容を確認したうえでバーコード表示できます。
- 短い数字グループ（例: `1234 5678`）は、`JAN` ラベルがある行を除き自動連結しません。5桁以上のグループを含む場合のみ連結候補にします。
- 日付・電話番号・会員番号・合計・小計・取引番号などは文脈から候補外にします。
- 同じJANの重複は自動統合・自動削除しません。
- 画像は縦横比を保って最大2400pxへ縮小（実機計測前の暫定値）、30MB上限、白背景JPEG（品質0.92）に変換します。HEIC/HEIFは全ブラウザ対応を保証しません。
- OCRジョブはジョブIDと `AbortController` で競合・キャンセルを処理し、worker等の資源を解放します。

## テストと検証結果（2026-10-20時点）

実行済み:

| 項目 | 結果 |
|---|---|
| `npm run lint` | 成功 |
| `npm run typecheck` | 成功 |
| `npm test` | 9ファイル / 66テスト すべて成功 |
| `npm run test:e2e` | 5テスト すべて成功（Playwright Chromium / Pixel 7相当。本番ビルドのサブパス配信を含む） |
| `npm run build` | 成功。JS 344.76 kB（gzip 100.97 kB）、CSS 15.55 kB（gzip 4.08 kB） |
| `npm audit` | 0 vulnerabilities（インストール時点） |
| GitHub Actions（CI / Deploy） | 成功（2026-10-20） |
| 公開URLのスモーク確認 | 手入力 → 確認 → EAN-13バーコード表示、CSS / JS資産の読み込み、同一オリジン以外へのリクエストなし |

合成レシート画像（`tests/fixtures/receipt-sample.png`、架空データ）を使った**実際のTesseract.js OCRのスモーク確認**もローカルで実施しました。

- 5件のJAN候補を抽出し、4件はチェックデジット有効、意図的に不正にした1件は無効と判定。
- 商品名は4件で正しく対応付け。1件はOCRが「1個」を「18」と誤読。
- 実OCRでも全件が未確認状態で表示され、人間の確認が必要な挙動を確認。

## 未検証・既知の制約

**実機スキャナーによる検証は未実施です。** リリース前には次を実機で確認してください。

- iPhone Safari、Android Chrome で撮影 → OCR → バーコード表示
- ハンディスキャナーで画面の **EAN-13 / EAN-8** を読み取り、返却値が入力値と一致すること
- 光量、画面の明るさ、縦横、表示サイズ、保護フィルムの影響
- レジがJAN-8に対応しているか（非対応の場合はJAN-13のみ運用などの判断が必要）

その他の制約:

- OCRはレシートの印字・撮影条件により誤認識します。チェックデジットが一致しても別商品の番号である可能性があります。
- 実店舗のレシート画像は精度評価に使わないでください。使う場合はローカルに置き、Gitの追跡対象外（`tests/fixtures/local/` など）にしてください。
- EAN-13 / EAN-8 以外のバーコード規格（CODE128など）は対象外です。
- 初回OCRは言語データの取得に時間がかかり、通信失敗時は再試行が必要です。
- Wake Lock 非対応ブラウザでは、端末の自動ロック設定を手動で調整する必要があります。
- 画像の最大2400px・30MBは実機計測前の暫定値です。
- P1/P2の履歴・PWA・オフライン起動は未実装です。
- GitHub Pages のアプリURLは誰でも閲覧できます。認証はありませんが、各端末の処理データは共有されません。

## ディレクトリ構成

```text
.
├── .github/workflows/
│   ├── ci.yml                 # lint / 型 / テスト / E2E / build
│   └── deploy.yml             # GitHub Pages 配信
├── docs/
│   └── Receipt2JAN_Design_Spec.md
├── src/
│   ├── components/            # 各画面・入力部品
│   ├── features/receipt/      # JAN抽出・検証・商品名対応付け・画面状態
│   ├── hooks/
│   ├── lib/                   # jan / barcode / ocr / imageProcessing
│   │   └── testing/           # E2E用固定OCRエンジン
│   └── types/
├── tests/
│   ├── unit/                  # 純粋関数・ロジック
│   ├── components/            # UI
│   ├── e2e/                   # Playwright
│   └── fixtures/              # 架空レシート画像と生成スクリプト
├── playwright.config.ts
├── vite.config.ts
└── package.json
```

## トラブルシューティング

- **OCRデータを取得できない**: 通信環境を確認して再試行してください。初回のみCDNから取得します。
- **画像を読み込めない**: JPEG / PNG / WebP に変換して再試行してください。HEIC/HEIFは環境によりデコードできません。
- **バーコードが読み取れない**: 画面の明るさを上げ、集中表示・横向きを試し、それでも読めない場合は画面のJAN数字をレジに手入力してください。
- **結果が消えた**: P0では保存していません。再読み込み・タブ終了で失われます。

### Cloudflare Pages

ビルドコマンドは `npm run build`、出力ディレクトリは `dist`。`BASE_PATH` は未設定、または `/` にします。GitHub Pages用の `/ReceiptCode/` や `/receipt2jan/` を指定すると、ドメイン直下では資産の読み込み先が合わなくなります。既存のハッシュ付きデプロイURLは過去の成果物を指すため、修正後のデプロイを開いてください。
