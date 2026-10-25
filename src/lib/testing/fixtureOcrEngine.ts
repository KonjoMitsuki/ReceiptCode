import {
  OcrCancelledError,
  type OcrEngine,
  type OcrProgress,
  type OcrRecognizeOptions,
  type OcrResult,
} from '../ocr';
import { FIXTURE_RECEIPT_TEXT } from './receiptFixture';

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new OcrCancelledError());
      return;
    }

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new OcrCancelledError());
    };

    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const progressSteps: OcrProgress[] = [
  {
    stage: 'loading',
    ratio: 0.06,
    message: 'OCRエンジンを準備しています',
  },
  {
    stage: 'loading',
    ratio: 0.2,
    message: '日本語・英数字のOCRデータを準備しています',
  },
  {
    stage: 'recognizing',
    ratio: 0.45,
    message: '文字を認識しています',
  },
  {
    stage: 'recognizing',
    ratio: 0.78,
    message: '文字を認識しています',
  },
  {
    stage: 'parsing',
    ratio: 0.97,
    message: '読み取り結果を整理しています',
  },
];

class FixtureOcrEngine implements OcrEngine {
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  async recognize(
    _image: Blob,
    { signal, onProgress }: OcrRecognizeOptions,
  ): Promise<OcrResult> {
    for (const progress of progressSteps) {
      await delay(180, signal);
      onProgress(progress);
    }

    return { text: this.text, lines: [] };
  }

  async dispose(): Promise<void> {
    // 固定データのみのテスト用エンジン。
  }
}

function fixtureText(): string {
  // E2Eで「JAN候補なし」の分岐を検証するための切り替え。
  const scenario = new URLSearchParams(window.location.search).get('fixture');
  return scenario === 'empty' ? '' : FIXTURE_RECEIPT_TEXT;
}

export function createFixtureOcrEngine(): OcrEngine {
  return new FixtureOcrEngine(fixtureText());
}
