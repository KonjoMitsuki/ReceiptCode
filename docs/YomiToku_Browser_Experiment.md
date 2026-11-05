# YomiToku ブラウザ内OCR導入調査

## 目的

ReceiptCode のブラウザ完結・静的配信を維持し、既存の Tesseract.js と YomiToku のレシート文字認識精度を比較する。JAN検証・商品名対応付け・バーコード画面は既存実装を維持する。

## 現時点で確認できたこと

- YomiToku Studio はブラウザ内の WebAssembly / WebGPU で推論できる。
- 公式 Python パッケージの公開リポジトリと Studio のブラウザ実装は別物である。
- Studio のブラウザエンジンを第三者アプリに組み込むための公開 SDK・npm パッケージ・再配布許諾は確認できていない。
- したがって、Studio の JS/WASM/ONNX バイナリを抽出・コピーして本リポジトリに加えることはしない。
- YomiToku Studio のモデルは文書解析で初回約250〜300 MBを取得する旨が公式マニュアルに記載されており、モバイル利用前に通信量とメモリの検証が必要。

参考:
- https://github.com/kotaro-kinoshita/yomitoku
- https://yomitoku-studio.mlism.com/
- https://yomitoku-studio.mlism.com/manual

## ブラウザ実装が利用可能になった場合の接続設計

- `src/lib/ocr.ts` の `OcrEngine` インターフェースを使う。
- `src/lib/yomitokuOcr.ts` をエンジンアダプタとして実装し、`recognize(image, { signal, onProgress })` から `{ text }` を返す。
- `src/features/receipt/useReceiptFlow.ts` の依存注入をそのまま利用し、OCRエンジン選択UIを追加する。
- 初期設定は Tesseract.js にし、YomiTokuは明示的に選択した場合だけ起動する。
- キャンセル、モデル初回取得、エラー表示、再試行を統合する。
- 画像の外部送信を行わず、JAN-13/EAN-8検証と手動修正を維持する。
- テスト用の架空レシート画像を使い、文字一致率・JAN抽出率・処理時間・メモリ消費を比較する。

## 現在の状態

このブランチでは**YomiToku実行機能は未実装**。SDK・モデルの再配布／利用許諾を確認する必要がある。Pythonサーバーや外部OCR APIへの代替は、ブラウザ内実行の要件を満たさないため追加していない。
