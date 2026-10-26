import type { OcrEngine, OcrRecognizeOptions, OcrResult } from '../../lib/ocr';
import type { BenchmarkEngineFactory, EngineDescriptor } from './types';
import { PaddleEngine } from './paddleEngine';

export const GOOGLE_ENDPOINT = '/api/dev/ocr-benchmark/vision';
export const CONSENT_VERSION = 'vision-online-v1';

export const ENGINES: EngineDescriptor[] = [
  {
    id: 'tesseract', label: 'Tesseract.js 7', model: 'tesseract.js@7.0.0 / jpn / LSTM / PSM.AUTO',
    preprocessing: 'アプリ側の変換なし。内部でLeptonicaの画像デコード・二値化・レイアウト解析。DPI=300、空白保持。', remote: false,
  },
  {
    id: 'paddle', label: 'PaddleOCR.js', model: '@paddleocr/paddleocr-js@0.4.2 / PP-OCRv5_mobile_det + PP-OCRv5_mobile_rec / japan / ORT 1.24.3 WASM・1スレッド',
    preprocessing: '内部で画像デコード、検出用リサイズ（長辺最大960px）、正規化、文字領域切り出し・認識用リサイズ。認識バッチ1の省メモリ設定。原画像は共通・分割なし。', remote: false,
  },
  {
    id: 'google', label: 'Google Cloud Vision', model: 'DOCUMENT_TEXT_DETECTION / languageHints: ja / online images:annotate',
    preprocessing: '同一画像を開発プロキシからbase64で送信。Google内部の前処理・モデル版は非公開。認識時間に通信を含む。', remote: true,
  },
];

class GoogleEngine implements OcrEngine {
  async recognize(image: Blob, { signal, onProgress }: OcrRecognizeOptions): Promise<OcrResult> {
    onProgress({ stage: 'recognizing', ratio: 0.3, message: '同意済みの画像をGoogleで認識しています' });
    const started = performance.now();
    const response = await fetch(GOOGLE_ENDPOINT, {
      method: 'POST', signal, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': image.type, 'X-OCR-Consent': CONSENT_VERSION }, body: image,
    });
    if (!response.ok) throw new Error('Google OCRに失敗しました。開発サーバーの設定・上限・APIの状態を確認してください。');
    const body: { text?: unknown } = await response.json();
    if (typeof body.text !== 'string') throw new Error('Google OCRの応答が不正です。');
    return { text: body.text, timings: { initializationMs: 0, recognitionMs: performance.now() - started } };
  }

  async dispose(): Promise<void> { /* 永続化・セッションなし。 */ }
}

/** 全エンジンは通常フローと同じOcrEngine契約。Googleは同意なしでは生成不可。 */
export function createBenchmarkEngineFactory(googleConsent: boolean): BenchmarkEngineFactory {
  return async (id) => {
    if (id === 'google') {
      if (!googleConsent) throw new Error('Googleへの画像送信に同意が必要です。');
      return new GoogleEngine();
    }
    if (id === 'paddle') return new PaddleEngine();
    const { createTesseractOcrEngine } = await import('../../lib/ocr');
    return createTesseractOcrEngine(['jpn']);
  };
}
