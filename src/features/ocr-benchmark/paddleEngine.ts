import type { NormalizedPipelineConfig, OcrResult as PaddleResult } from '@paddleocr/paddleocr-js';
import paddleWorkerUrl from 'paddleocr-worker?url';
import { OcrCancelledError } from '../../lib/ocr';
import type { OcrEngine, OcrRecognizeOptions, OcrResult } from '../../lib/ocr';

/** SDK 0.4.2 の配布Workerと通信する軽量クライアント。
 * SDK本体をここでimportすると、Workerとは別に画面側にもOpenCV/WASMが起動する。
 * privateな通信形式のため、SDK更新時は実Workerのスモークテストも必須。
 */
export class PaddleEngine implements OcrEngine {
  private worker: Worker | null = null;
  private cancelPending: ((error: Error) => void) | null = null;
  private nextRequestId = 0;

  private request<T>(type: 'init' | 'predict', payload: unknown): Promise<T> {
    const worker = this.worker!;
    const requestId = ++this.nextRequestId;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onError);
        this.cancelPending = null;
      };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const onError = () => fail(new Error('PaddleOCR Workerが停止しました。画像を小さくして再試行してください。'));
      const onMessage = ({ data }: MessageEvent) => {
        if (data?.kind !== 'worker-transport-response' || data.requestId !== requestId) return;
        if (data.status !== 'success') {
          fail(new Error('PaddleOCRに失敗しました。モデル取得・画像形式・端末のメモリを確認してください。'));
          return;
        }
        cleanup();
        resolve(data.payload as T);
      };
      const timer = setTimeout(() => fail(new Error('PaddleOCRが時間内に応答しませんでした。通信環境・画像サイズを確認して再試行してください。')), 180_000);
      this.cancelPending = fail;
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onError);
      try {
        const transfer = type === 'predict' ? [(payload as { sources: { imageBitmap: ImageBitmap }[] }).sources[0].imageBitmap] : [];
        worker.postMessage({ kind: 'worker-transport-request', type, payload, requestId }, transfer);
      } catch {
        fail(new Error('PaddleOCRへ画像を渡せませんでした。このブラウザの画像処理機能を確認してください。'));
      }
    });
  }

  async recognize(image: Blob, { signal, onProgress }: OcrRecognizeOptions): Promise<OcrResult> {
    if (signal.aborted) throw new OcrCancelledError();
    if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
      throw new Error('このブラウザはPaddleOCRの画像処理に対応していません。iOS・ブラウザを更新してください。');
    }
    const started = performance.now();
    let bitmap: ImageBitmap | undefined;
    const abort = () => { void this.dispose(); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      onProgress({ stage: 'loading', ratio: 0, message: 'PaddleOCRのモデルを準備しています' });
      this.worker = new Worker(paddleWorkerUrl, { type: 'module' });
      await this.request('init', { options: {
        pipelineConfig: pipelineConfig(),
        ortOptions: { backend: 'wasm', numThreads: 1, proxy: false, disableWasmProxy: true, wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/' },
      } });
      if (signal.aborted) throw new OcrCancelledError();
      const recognitionStarted = performance.now();
      onProgress({ stage: 'recognizing', ratio: 0.3, message: 'PaddleOCRで文字を認識しています' });
      bitmap = await createImageBitmap(image);
      if (signal.aborted) throw new OcrCancelledError();
      const results = await this.request<PaddleResult[]>('predict', {
        sources: [{ kind: 'imageBitmap', imageBitmap: bitmap }], params: {},
      });
      const result = results?.[0];
      if (!result || !Array.isArray(result.items) || result.items.some((item) => typeof item?.text !== 'string')) {
        throw new Error('PaddleOCRの認識結果が不正です。');
      }
      return {
        text: result.items.map((item) => item.text).join('\n'),
        timings: { initializationMs: recognitionStarted - started, recognitionMs: performance.now() - recognitionStarted },
      };
    } finally {
      signal.removeEventListener('abort', abort);
      bitmap?.close();
      await this.dispose();
    }
  }

  async dispose(): Promise<void> {
    this.cancelPending?.(new OcrCancelledError());
    this.worker?.terminate();
    this.worker = null;
  }
}

function pipelineConfig(): NormalizedPipelineConfig {
  const asset = (kind: 'det' | 'rec') => {
    const url = new URL(`https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_${kind}_onnx_infer.tar`);
    // Origin反射CORS応答の混在を防ぐ。画像や認識結果は送らない。
    url.searchParams.set('receiptcode-origin', location.origin);
    return { url: url.href };
  };
  return {
    pipelineName: 'OCR', raw: {}, warnings: [], unsupportedFeatures: [],
    modelSelection: { textDetectionModelName: 'PP-OCRv5_mobile_det', textRecognitionModelName: 'PP-OCRv5_mobile_rec' },
    assets: { det: asset('det'), rec: asset('rec') },
    pipelineBatchSize: 1, textDetectionBatchSize: 1, textRecognitionBatchSize: 1,
    // 元画像は共通のまま、巨大な推論テンソルを作らないよう検出器内部を制限する。
    runtimeDefaults: { text_det_limit_side_len: 960, text_det_limit_type: 'max', text_det_max_side_limit: 960, text_det_unclip_ratio: 1.5 },
  };
}
