import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

export type OcrStage = 'loading' | 'recognizing' | 'parsing';

export interface OcrProgress {
  stage: OcrStage;
  ratio: number;
  message: string;
}

export interface OcrResult {
  text: string;
}

export interface OcrRecognizeOptions {
  signal: AbortSignal;
  onProgress: (progress: OcrProgress) => void;
}

export interface OcrEngine {
  recognize(image: Blob, options: OcrRecognizeOptions): Promise<OcrResult>;
  dispose(): Promise<void>;
}

export type OcrEngineFactory = () => Promise<OcrEngine>;

export type OcrErrorCode = 'model-load-failed' | 'ocr-failed' | 'cancelled';

export class OcrError extends Error {
  readonly code: OcrErrorCode;

  constructor(code: OcrErrorCode, message: string) {
    super(message);
    this.name = 'OcrError';
    this.code = code;
  }
}

export class OcrCancelledError extends OcrError {
  constructor() {
    super('cancelled', '読み取りをキャンセルしました。');
    this.name = 'OcrCancelledError';
  }
}

interface TesseractLogMessage {
  status: string;
  progress: number;
}

const clampRatio = (value: number): number =>
  Math.min(1, Math.max(0, value));

/**
 * Tesseract.js をブラウザのWeb Workerで実行する。
 * 画像・OCR原文はこの端末内のWorkerとの間だけで扱い、外部APIへ送信しない。
 * 言語データ等の初回取得のみHTTPS通信が発生する。
 */
class TesseractOcrEngine implements OcrEngine {
  private worker: Worker | null = null;
  private used = false;
  private abortListener: (() => void) | null = null;

  async recognize(
    image: Blob,
    { signal, onProgress }: OcrRecognizeOptions,
  ): Promise<OcrResult> {
    if (this.used) {
      throw new OcrError(
        'ocr-failed',
        'OCRエンジンは再利用できません。もう一度読み取りを開始してください。',
      );
    }
    this.used = true;

    let recognizingStarted = false;
    let lastRatio = -1;
    let lastMessage = '';

    const report = (progress: OcrProgress) => {
      if (signal.aborted) return;
      const ratio = clampRatio(progress.ratio);
      if (
        Math.abs(ratio - lastRatio) < 0.01 &&
        progress.message === lastMessage
      ) {
        return;
      }
      lastRatio = ratio;
      lastMessage = progress.message;
      onProgress({ ...progress, ratio });
    };

    const handleLog = (log: TesseractLogMessage) => {
      const status = log.status.toLowerCase();
      const progress = clampRatio(Number(log.progress) || 0);

      if (status.includes('recognizing')) {
        recognizingStarted = true;
        report({
          stage: 'recognizing',
          ratio: 0.32 + progress * 0.63,
          message: '文字を認識しています',
        });
        return;
      }

      if (status.includes('loading language')) {
        report({
          stage: 'loading',
          ratio: 0.1 + progress * 0.16,
          message: '日本語・英数字のOCRデータを準備しています',
        });
        return;
      }

      if (status.includes('loading tesseract core')) {
        report({
          stage: 'loading',
          ratio: 0.02 + progress * 0.1,
          message: 'OCRエンジンを準備しています',
        });
        return;
      }

      if (status.includes('initializing')) {
        report({
          stage: 'loading',
          ratio: 0.3,
          message: 'OCRエンジンを初期化しています',
        });
      }
    };

    report({
      stage: 'loading',
      ratio: 0.01,
      message: 'OCRを準備しています',
    });

    try {
      const worker = await createWorker(['jpn', 'eng'], OEM.LSTM_ONLY, {
        logger: handleLog,
      });
      this.worker = worker;

      if (signal.aborted) {
        await this.terminateWorker();
        throw new OcrCancelledError();
      }

      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: PSM.AUTO,
      });

      if (signal.aborted) {
        await this.terminateWorker();
        throw new OcrCancelledError();
      }

      report({
        stage: 'recognizing',
        ratio: 0.32,
        message: '文字を認識しています',
      });

      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => {
          void this.terminateWorker();
          reject(new OcrCancelledError());
        };
        this.abortListener = onAbort;
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      });

      const recognition = worker.recognize(image);
      const result = await Promise.race([recognition, abortPromise]);

      if (signal.aborted) throw new OcrCancelledError();

      report({
        stage: 'parsing',
        ratio: 0.97,
        message: '読み取り結果を整理しています',
      });

      return { text: result.data.text ?? '' };
    } catch (error) {
      if (signal.aborted || error instanceof OcrCancelledError) {
        throw new OcrCancelledError();
      }
      if (error instanceof OcrError) throw error;

      throw new OcrError(
        recognizingStarted ? 'ocr-failed' : 'model-load-failed',
        recognizingStarted
          ? '文字認識に失敗しました。画像を変えて再試行してください。'
          : 'OCR用データを取得できませんでした。通信環境を確認して再試行してください。',
      );
    } finally {
      if (this.abortListener) {
        signal.removeEventListener('abort', this.abortListener);
        this.abortListener = null;
      }
      await this.terminateWorker();
    }
  }

  async dispose(): Promise<void> {
    await this.terminateWorker();
  }

  private async terminateWorker(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // すでに終了している場合は何もしない。
      }
    }
  }
}

export function createTesseractOcrEngine(): OcrEngine {
  return new TesseractOcrEngine();
}

export const defaultOcrEngineFactory: OcrEngineFactory = async () =>
  createTesseractOcrEngine();
