# ReceiptCode — YomiToku ブラウザ内 OCR 検証・実装仕様書 v1.0

作成日: 2026-11-05  
対象リポジトリ: https://github.com/KonjoMitsuki/ReceiptCode  
作業ブランチ: `experiment/yomitoku-ocr`  
状態: Codex 実装指示（調査ゲート付き）

## 0. Codex への指示（最優先）

この文書を実装仕様として読み、**既存の ReceiptCode リポジトリ内で**作業すること。新規プロジェクトを作らない。すでにブランチ `experiment/yomitoku-ocr` が存在するので、そのブランチで作業し、`main` を直接変更しない。ブランチ上の既存変更を確認し、破壊しない。

**最初に Gate A（公開ブラウザ実装・利用許諾）を調査する。** YomiToku Studio がブラウザで動くことだけを根拠に、第三者アプリ向け SDK が存在すると決めつけてはいけない。明確な根拠がなければ YomiToku の実行コード・モデルの無断コピー、スクレイピングによる移植、プロキシ・Python API・外部OCRサービスへの置換をしない。Gate A を満たせない場合は調査結果、障害、実現可能な代替案を記録し、既存アプリを壊さずに止める。**動作しないダミーのYomiToku選択肢を一般UIに出さない。**

## 1. 背景・目的

ReceiptCode (Receipt2JAN) はレシート画像から印字された JAN (EAN-13 / EAN-8) を読み取り、チェックデジットで検証し、レジ用スキャナに見せる SVG バーコードを表示する React + TypeScript + Vite の静的Webアプリ。既存OCRは Tesseract.js 7。画像は端末のブラウザ内だけで扱う。配信先は GitHub Pages / Cloudflare Pages を想定する。

本ブランチでは **YomiTokuによる日本語OCRをブラウザ内で実行する可能性の検証**を行い、利用可能と確認できた場合にのみ Tesseract.js と切り替えて同一レシートで比較できるプロトタイプを実装する。商品名の誤読・短いレシートの読み取り・JAN抽出への影響を評価する。無償提供予定でも、バイト先の店舗業務での利用はライセンス上の非商用利用とは限らないため、許諾確認前に業務運用へ提供しない。

## 2. 調査ゲート：Gate A（コード変更より先）

1. 次の一次情報の最新の公開状況、ソース、ライセンス、利用条件を確認し、URL・確認日・根拠とともに `docs/YomiToku_Feasibility.md` に記す。
   - https://github.com/kotaro-kinoshita/yomitoku
   - https://yomitoku-studio.mlism.com/
   - https://yomitoku-studio.mlism.com/manual
   - 公開されている場合、Studio固有のソースリポジトリ、npm配布物、モデル、ONNX/WASM/推論ランタイム
2. 確認項目：ブラウザ用エンジンの公開有無、実際の呼び出しAPI、依存関係、モデル取得URL、著作権・モデルのライセンス、第三者アプリへの組込み・再配布・店舗内業務利用の可否、スマホ対応、初回モデル転送量、メモリ・GPU要件、クロスオリジン/CSP制約。
3. **Gate A pass条件**：a) 実装可能な公開インターフェースとサンプルが確認できる、b) ReceiptCode が実装に必要なコード/モデル/資材を取得し利用する正当な許可が確認できる、c) 利用時にレシート画像やOCR結果が外部サービスへ送信されず、静的ホスティングで動く。業務利用許諾が未確定なら、検証用途と業務配備可否を明確に分離する。
4. **Gate A fail条件**：専用Webアプリとして動く情報しかない、SDK/モデルの利用条件が不明、Studio内部ファイルを抽出しないと使えない等。この場合は**実装を強行しない**。根拠付き調査レポートと、開発元に確認する具体的質問、代替候補（例：ライセンス確認可能なブラウザOCR）を残す。
5. Studio のUIに画像をアップロードする手動比較は別実験として可。ただしアプリからStudioへ画像を自動送信しない。

## 3. スコープ

### 実装する（Gate A pass時）
- `OcrEngine` インターフェースのまま新しいエンジンアダプターを追加する。
- 画像確認画面で `Tesseract.js` / `YomiToku (実験)` を選択可能にする。**初期値はTesseract.js**。
- エンジン選択は読み取り開始時点で確定し、進行中の切替は不可。読み取りをキャンセルして再実行できる。
- 既存の画像前処理、JAN候補抽出、商品名推定、チェックデジット検証、手動修正、SVGバーコード生成を変更せずに共用する。
- 短いレシートと一般的なレシートの比較手順・測定表・テストを追加する。
- 実験機能であること、ブラウザ互換性・初回ダウンロード量・業務利用許諾の注意をUIに簡潔に表示する。
- 必要な資材は合法的・再現可能な入手方法で管理し、モデルなど巨大なバイナリを安易にGitへコミットしない。

### スコープ外
- Python/FastAPIサーバー、Cloudflare Workersでの推論、外部有料API。
- 店舗POSへの接続、商品DB検索、JANの自動補完・生成。
- 認証、レシート原画像のアップロード、解析データの永続保存。
- 主ブランチや本番環境への自動デプロイ。

## 4. 既存設計の確認ポイント

着手前にコードを読み、以下の実際の契約に合わせる。ファイル名や型が更新されていたら現在の実装を優先する。

- `src/lib/ocr.ts`: `OcrEngine`, `OcrEngineFactory`, `OcrRecognizeOptions`, `OcrResult { text: string }`, `OcrError`, `OcrCancelledError`。
- `src/features/receipt/useReceiptFlow.ts`: `createOcrEngine` の依存注入、`AbortController` とジョブID、`parseReceipt(result.text)`。
- `src/App.tsx`: アップロード・プレビュー・OCR進捗・結果・バーコードの画面遷移。
- `src/components/ImagePreview.tsx`: プレビュー上の読み取りボタン。
- `src/main.tsx`: E2Eの `VITE_E2E_OCR` による固定エンジン注入。E2Eフラグを壊さない。
- `src/features/receipt/receiptParser.ts` と `src/lib/jan.ts`: 既存のパース／JAN検証を再利用する。
- Viteの `base` / 相対資産URL / GitHub Pagesサブパス配信を維持する。

## 5. 技術構成・インターフェース

Gate A pass時の推奨ファイル例（実際のコード配置に応じ調整可）：

```text
src/lib/yomitokuOcr.ts                  # OcrEngine実装、実際のブラウザSDKを呼び出す
src/lib/ocrEngineSelection.ts          # エンジン識別・factory
src/components/OcrEngineSelector.tsx   # プレビュー上の切替UI
tests/unit/yomitokuOcr.test.ts         # SDKモックによる正常系・失敗・中断
docs/YomiToku_Feasibility.md           # Gate A根拠、許諾、互換性
docs/YomiToku_Benchmark.md             # 比較方法と実測（未計測は未計測と記載）
```

既存の `OcrEngine` 型（擬似コード。既存定義を優先）：

```ts
interface OcrEngine {
  recognize(image: Blob, options: {
    signal: AbortSignal;
    onProgress: (progress: OcrProgress) => void;
  }): Promise<{ text: string }>;
  dispose(): Promise<void>;
}
```

必要条件：
- SDKの出力が文字列・段落・座標付き要素などでも、**行順を可能な限り保持した改行区切りテキスト**へ変換する。JAN候補を勝手に修正・補完しない。
- `AbortSignal` を受け、キャンセル後の古い処理結果がUIへ反映されないこと。SDKに中断APIがない場合は、その制約を記録し、少なくとも結果破棄と資源解放の安全性を保証する。
- `dispose()` を冪等にし、worker/セッション/GPUリソース等を可能な限り解放する。
- SDKが進捗率を提供しない場合は、**実際の推論率と偽って表示せず**、読み込み・初期化・認識中などの段階を表示する。
- モデル初期化失敗と認識失敗を既存の `OcrError` へ適切に対応させる。ユーザーにわかる再試行・Tesseractへの切替案内を出す。
- WebGPU非対応時はSDKが公式対応するCPU/WASMフォールバックがあれば利用し、なければYomiTokuを無効化して理由を表示。**自動的に画像を外部へ転送しない**。
- 実験用選択状態は原則ページ内メモリだけで管理し、必要以上に永続化しない。
- ライセンス表示、帰属表示、モデルの取得元は必要条件を守る。

## 6. UI要件

既存のMaterial 3画面・スマホ表示・44px程度のタッチ領域を保つ。プレビュー画面の「この画像で読み取る」の近くにOCRエンジン選択を置く。エンジン切替後も**既存のJAN抽出・確認画面・バーコード表示は共通**とする。

エラー時にTesseractで再試行できる手段を用意する。エンジンの利用可否が未確定／未実装の場合、ユーザーが選べる実行機能として表示しない。モデル取得が大容量なら初回起動前に通信量を明示し、利用者が明示的に開始するまでダウンロードしない。無償公開予定と業務利用許諾を混同しない。

## 7. 品質・検証

必須コマンド：
```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```
可能なら `npm run test:e2e` も実行し、サブパス配信・モバイルビューポートも検証する。未実行コマンドは未実行と記録し、成功と書かない。

テスト条件：
1. Tesseract.js既定で従来通り動く。
2. Gate A pass後のYomiTokuで、レシート画像→OCR→JAN候補→バーコードまで通る。
3. 日本語行とJAN数字の行順が維持される。候補JANの検証は既存ロジックのまま。
4. OCR途中のキャンセル、連続実行、画面遷移、資材取得失敗、GPU未対応、再試行で壊れない。
5. 本番ビルド、ルート/サブパス両方の資産参照が成立。
6. 画像・OCRテキストを外部送信しない。モデル取得など必要な静的通信と画像の通信を明確に区別。
7. 実際の店のレシート・個人情報はリポジトリやテストログにコミットしない。架空の合成画像、またはローカルでGit管理外の画像を使用する。

測定は**同じ画像**で Tesseract と YomiToku を実行し、各エンジンの「商品名完全一致率」「印字JANの抽出率」「JAN-商品名対応率」「処理時間（初回とウォーム）」「初回ダウンロード容量」「メモリ・互換性」を記録する。実測前の数値を創作しない。最低10枚程度の許可済み／合成サンプルを目標とし、短い／長い／傾き／低コントラストを分ける。

## 8. 完了条件

### Gate A failのときの完了
`docs/YomiToku_Feasibility.md` に結論、一次情報URL、未解決の権利・SDK問題、開発元へ確認する質問を残す。既存アプリに退行を起こさず、**YomiToku実装なし**と明記する。必要な追加調査やユーザー承認を報告する。見かけだけの実装はしない。

### Gate A passのときの完了
ブラウザ内でYomiTokuが実際に認識でき、エンジン切替、JANパース、バーコード表示、キャンセルとエラー処理、テストとベンチマーク手順が整っていること。UIに実験用であることを示し、実機検証・業務利用許諾の未確認点を明示する。

## 9. Codexの報告形式

作業終了時に以下を簡潔に報告する：
- Gate Aの判定（pass/fail）と根拠URL
- 変更ファイルと実装内容（または未実装の理由）
- 既存Tesseractに対する影響
- 実行したテストと結果、未実行のテスト
- ブラウザ上での動作確認・未確認
- ライセンス上の保留事項と、次に必要な行動
- コミットSHAとブランチURL。PRを作る場合は本番反映しない。

## 10. 参考URL

- https://github.com/kotaro-kinoshita/yomitoku
- https://yomitoku-studio.mlism.com/
- https://yomitoku-studio.mlism.com/manual
- https://github.com/KonjoMitsuki/ReceiptCode
- `docs/YomiToku_Browser_Experiment.md`（同ブランチの先行調査）
