import { OcrCancelledError } from '../../lib/ocr';
import type { OcrEngine, OcrRecognizeOptions, OcrResult } from '../../lib/ocr';
import type { BenchmarkEngineFactory, EngineDescriptor } from './types';
import paddleWorkerUrl from 'paddleocr-worker?url';

export const GOOGLE_ENDPOINT = '/api/dev/ocr-benchmark/vision';
export const CONSENT_VERSION = 'vision-online-v1';

export const ENGINES: EngineDescriptor[] = [
  {
    id: 'tesseract', label: 'Tesseract.js 7', model: 'tesseract.js@7.0.0 / jpn / LSTM / PSM.AUTO',
    preprocessing: 'アプリ側の変換なし。内部でLeptonicaの画像デコード・二値化・レイアウト解析。DPI=300、空白保持。', remote: false,
  },
  {
    id: 'paddle', label: 'PaddleOCR.js', model: '@paddleocr/paddleocr-js@0.4.2 / PP-OCRv5_mobile_det + PP-OCRv5_mobile_rec / japan / ORT 1.24.3 WASM・1スレッド',
    preprocessing: '内部で画像デコード、検出用リサイズ（min=64、max=4000）、正規化、文字領域切り出し・認識用リサイズ。アプリの分割はなし。', remote: false,
  },
  {
    id: 'google', label: 'Google Cloud Vision', model: 'DOCUMENT_TEXT_DETECTION / languageHints: ja / online images:annotate',
    preprocessing: '同一画像を開発プロキシからbase64で送信。Google内部の前処理・モデル版は非公開。認識時間に通信を含む。', remote: true,
  },
];

class PaddleEngine implements OcrEngine {
  private worker: Worker | null = null;

  async recognize(image: Blob, { signal, onProgress }: OcrRecognizeOptions): Promise<OcrResult> {
    if (signal.aborted) throw new OcrCancelledError();
    const started = performance.now();
    onProgress({ stage: 'loading', ratio: 0, message: 'PaddleOCRのモデルを準備しています' });
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener('abort', abort);
        this.worker?.terminate();
        this.worker = null;
      };
      const abort = () => { finish(); reject(new OcrCancelledError()); };
      signal.addEventListener('abort', abort, { once: true });
      const perform = async (): Promise<OcrResult> => {
        const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
        if (signal.aborted) throw new OcrCancelledError();
        const ocr = await PaddleOCR.create({
          lang: 'japan', ocrVersion: 'PP-OCRv5',
          textDetectionModelName: 'PP-OCRv5_mobile_det', textRecognitionModelName: 'PP-OCRv5_mobile_rec',
          // 配布CDNのOrigin反射CORS応答が別オリジン用にキャッシュされるのを避ける。
          // Originは通常のCORSヘッダーと同じ公開情報。画像・OCR結果は含めない。
          textDetectionModelAsset: { url: paddleModelUrl('det') },
          textRecognitionModelAsset: { url: paddleModelUrl('rec') },
          worker: { createWorker: () => {
            const worker = new Worker(paddleWorkerUrl, { type: 'module' });
            this.worker = worker;
            worker.addEventListener('error', () => { finish(); reject(new Error('PaddleOCR Workerの起動に失敗しました。')); }, { once: true });
            return worker;
          } },
          ortOptions: { backend: 'wasm', numThreads: 1, proxy: false, wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/' },
        });
        if (signal.aborted) throw new OcrCancelledError();
        const recognitionStarted = performance.now();
        onProgress({ stage: 'recognizing', ratio: 0.3, message: 'PaddleOCRで文字を認識しています' });
        const [result] = await ocr.predict(image);
        const ended = performance.now();
        return {
          text: result.items.map((item) => item.text).join('\n'),
          timings: { initializationMs: recognitionStarted - started, recognitionMs: ended - recognitionStarted },
        };
      };
      void perform().then((result) => { finish(); resolve(result); }, () => {
        finish();
        reject(signal.aborted ? new OcrCancelledError() : new Error('PaddleOCRに失敗しました。モデル取得・画像形式・端末のメモリを確認してください。'));
      });
    });
  }

  async dispose(): Promise<void> {
    this.worker?.terminate();
    this.worker = null;
  }
}

function paddleModelUrl(kind: 'det' | 'rec'): string {
  const url = new URL(`https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_${kind}_onnx_infer.tar`);
  url.searchParams.set('receiptcode-origin', location.origin);
  return url.href;
}

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
