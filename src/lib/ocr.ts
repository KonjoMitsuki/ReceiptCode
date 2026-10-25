import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

export type OcrStage = 'loading' | 'recognizing' | 'parsing';

export interface OcrProgress {
  stage: OcrStage;
  ratio: number;
  message: string;
}

export interface OcrBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrLine {
  text: string;
  bbox: OcrBBox;
  confidence: number;
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
}

export interface OcrRecognizeOptions {
  signal: AbortSignal;
  onProgress: (progress: OcrProgress) => void;
  pageSegMode?: PSM;
}

export interface OcrEngine {
  recognize(image: Blob, options: OcrRecognizeOptions): Promise<OcrResult>;
  dispose(): Promise<void>;
}

export interface OcrEngineOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
  /** 日本語レシートでは英語モデルによる日本語の誤置換を避ける。 */
  language?: 'jpn' | 'jpn+eng';
}

export type OcrEngineFactory = (
  options?: OcrEngineOptions,
) => Promise<OcrEngine>;

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

interface TsvWord {
  text: string;
  bbox: OcrBBox;
  confidence: number;
}

const clampRatio = (value: number): number =>
  Math.min(1, Math.max(0, value));

function median(values: number[]): number {
  if (values.length === 0) return 8;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 8;
}

function isJapaneseText(text: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(
    text,
  );
}

function shouldJoinWithoutSpace(
  previous: string,
  next: string,
  gap: number,
  charWidth: number,
): boolean {
  if (gap <= charWidth * 0.6) return true;

  const previousText = previous.trim();
  const nextText = next.trim();
  if (!previousText || !nextText) return true;

  if (/^\d+$/.test(previousText) && /^\d+$/.test(nextText)) {
    const combined = previousText.length + nextText.length;
    if (combined === 8 || combined === 13) return true;
  }

  return isJapaneseText(previousText) && isJapaneseText(nextText) &&
    gap <= charWidth;
}

/**
 * Tesseractの単語単位TSVから1行分の文字列を組み立てる。
 * 日本語やJANの数字の間に不要な空白を入れず、商品名と価格は離して1行に戻す。
 */
export function reconstructLineText(words: TsvWord[]): string {
  const sorted = words
    .filter((word) => word.text.trim())
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (sorted.length === 0) return '';

  const charWidths = sorted.map(
    (word) =>
      (word.bbox.x1 - word.bbox.x0) /
      Math.max(1, [...word.text.trim()].length),
  );
  const charWidth = median(charWidths);
  let text = sorted[0].text.trim();
  let previous = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const word = sorted[index];
    const nextText = word.text.trim();
    if (!nextText) continue;

    const gap = word.bbox.x0 - previous.bbox.x1;
    if (shouldJoinWithoutSpace(previous.text, nextText, gap, charWidth)) {
      text += nextText;
    } else {
      text += ` ${nextText}`;
    }
    previous = word;
  }

  return text.replace(/\s+/g, ' ').trim();
}

function parseTsvWord(columns: string[]): TsvWord | null {
  if (columns.length < 12 || columns[0] !== '5') return null;

  const confidence = Number(columns[10]);
  const text = columns.slice(11).join('\t').trim();
  // 紙の縁・影を罫線として認識した単語は、bboxが複数行をまたぐことがある。
  // 文字を含まない罫線だけを除外し、隣接する明細の誤結合を防ぐ。
  if (/^[|｜[\]_=~—–-]+$/.test(text)) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || !text) {
    return null;
  }

  const left = Number(columns[6]);
  const top = Number(columns[7]);
  const width = Number(columns[8]);
  const height = Number(columns[9]);
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    text,
    bbox: {
      x0: left,
      y0: top,
      x1: left + width,
      y1: top + height,
    },
    confidence,
  };
}

/**
 * TesseractのTSVを行単位へまとめる。
 * 位置情報が取れない場合は、座標なしの行統合に戻さずエラーにする。
 */
export function parseTsv(tsv: string): OcrLine[] {
  const groups = new Map<string, TsvWord[]>();

  for (const row of tsv.split(/\r?\n/)) {
    if (!row.trim()) continue;
    const columns = row.split('\t');
    if (columns.length < 12 || columns[0] !== '5') continue;

    const key = columns.slice(1, 5).join(':');
    const word = parseTsvWord(columns);
    if (!word) continue;
    const group = groups.get(key);
    if (group) group.push(word);
    else groups.set(key, [word]);
  }

  const lines: OcrLine[] = [];
  for (const words of groups.values()) {
    const text = reconstructLineText(words);
    if (!text) continue;

    const bbox = words.reduce<OcrBBox>(
      (union, word) => ({
        x0: Math.min(union.x0, word.bbox.x0),
        y0: Math.min(union.y0, word.bbox.y0),
        x1: Math.max(union.x1, word.bbox.x1),
        y1: Math.max(union.y1, word.bbox.y1),
      }),
      {
        x0: Number.POSITIVE_INFINITY,
        y0: Number.POSITIVE_INFINITY,
        x1: Number.NEGATIVE_INFINITY,
        y1: Number.NEGATIVE_INFINITY,
      },
    );

    const confidence =
      words.reduce((sum, word) => sum + word.confidence, 0) /
      words.length;

    lines.push({ text, bbox, confidence });
  }

  return lines.sort(
    (a, b) =>
      (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2 ||
      a.bbox.x0 - b.bbox.x0,
  );
}

/**
 * Tesseract.js をブラウザのWeb Workerで実行する。
 * 画像・OCR原文はこの端末内のWorkerとの間だけで扱い、外部APIへ送信しない。
 * 言語データ等の初回取得のみHTTPS通信が発生する。
 */
class TesseractOcrEngine implements OcrEngine {
  private worker: Worker | null = null;
  private termination: Promise<void> | null = null;
  private disposed = false;
  private recognizing = false;
  private phase: 'loading' | 'recognizing' = 'loading';
  private progressSink: ((progress: OcrProgress) => void) | null = null;
  private progressSignal: AbortSignal | null = null;
  private lastRatio = -1;
  private lastMessage = '';
  private recognizingStarted = false;
  private abortListener: (() => void) | null = null;

  static async create(options: OcrEngineOptions): Promise<OcrEngine> {
    const engine = new TesseractOcrEngine();
    await engine.initialize(options);
    return engine;
  }

  private report(progress: OcrProgress): void {
    if (this.progressSignal?.aborted) return;
    const ratio = clampRatio(progress.ratio);
    if (
      Math.abs(ratio - this.lastRatio) < 0.01 &&
      progress.message === this.lastMessage
    ) {
      return;
    }
    this.lastRatio = ratio;
    this.lastMessage = progress.message;
    this.progressSink?.({ ...progress, ratio });
  }

  private handleLog = (log: TesseractLogMessage): void => {
    const status = log.status.toLowerCase();
    const progress = clampRatio(Number(log.progress) || 0);

    if (status.includes('recognizing')) {
      this.recognizingStarted = true;
      if (this.phase !== 'recognizing') return;
      this.report({
        stage: 'recognizing',
        ratio: 0.32 + progress * 0.63,
        message: '文字を認識しています',
      });
      return;
    }

    if (this.phase !== 'loading') return;

    if (status.includes('loading language')) {
      this.report({
        stage: 'loading',
        ratio: 0.1 + progress * 0.16,
        message: 'OCR言語データを準備しています',
      });
      return;
    }

    if (status.includes('loading tesseract core')) {
      this.report({
        stage: 'loading',
        ratio: 0.02 + progress * 0.1,
        message: 'OCRエンジンを準備しています',
      });
      return;
    }

    if (status.includes('initializing')) {
      this.report({
        stage: 'loading',
        ratio: 0.3,
        message: 'OCRエンジンを初期化しています',
      });
    }
  };

  private resetProgress(
    phase: 'loading' | 'recognizing',
    signal: AbortSignal | undefined,
    onProgress: ((progress: OcrProgress) => void) | undefined,
  ): void {
    this.phase = phase;
    this.progressSignal = signal ?? null;
    this.progressSink = onProgress ?? null;
    this.lastRatio = -1;
    this.lastMessage = '';
    this.recognizingStarted = false;
  }

  private async initialize({
    signal,
    onProgress,
    language = 'jpn+eng',
  }: OcrEngineOptions): Promise<void> {
    this.resetProgress('loading', signal, onProgress);
    this.report({
      stage: 'loading',
      ratio: 0.01,
      message: 'OCRを準備しています',
    });

    try {
      const worker = await createWorker(language.split('+'), OEM.LSTM_ONLY, {
        logger: this.handleLog,
      });
      this.worker = worker;

      if (signal?.aborted) {
        await this.terminateWorker();
        throw new OcrCancelledError();
      }

      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: PSM.AUTO,
      });

      if (signal?.aborted) {
        await this.terminateWorker();
        throw new OcrCancelledError();
      }
    } catch (error) {
      await this.terminateWorker();
      if (signal?.aborted || error instanceof OcrCancelledError) {
        throw new OcrCancelledError();
      }
      if (error instanceof OcrError) throw error;
      throw new OcrError(
        'model-load-failed',
        'OCR用データを取得できませんでした。通信環境を確認して再試行してください。',
      );
    } finally {
      this.progressSink = null;
      this.progressSignal = null;
    }
  }

  async recognize(
    image: Blob,
    { signal, onProgress, pageSegMode = PSM.AUTO }: OcrRecognizeOptions,
  ): Promise<OcrResult> {
    if (this.disposed || !this.worker) {
      throw new OcrError(
        'ocr-failed',
        'OCRエンジンが終了しています。もう一度読み取りを開始してください。',
      );
    }
    if (this.recognizing) {
      throw new OcrError(
        'ocr-failed',
        'OCRエンジンは同時に複数の画像を処理できません。',
      );
    }
    this.recognizing = true;
    this.resetProgress('recognizing', signal, onProgress);

    try {
      const worker = this.worker;
      await worker.setParameters({
        tessedit_pageseg_mode: pageSegMode,
      });

      if (signal.aborted) throw new OcrCancelledError();

      this.report({
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

      const recognition = worker.recognize(image, {}, { tsv: true });
      const result = await Promise.race([recognition, abortPromise]);

      if (signal.aborted) throw new OcrCancelledError();

      this.report({
        stage: 'parsing',
        ratio: 0.97,
        message: '読み取り結果を整理しています',
      });

      const tsv = result.data.tsv ?? '';
      const ocrText = result.data.text ?? '';
      const lines = parseTsv(tsv);
      if (lines.length === 0) {
        // 余白だけのタイルは文字なしで正常終了する。
        if (!ocrText.trim()) {
          return { text: '', lines: [] };
        }
        throw new OcrError(
          'ocr-failed',
          'OCR結果の位置情報を取得できませんでした。もう一度読み取りを開始してください。',
        );
      }

      return {
        text: ocrText || lines.map((line) => line.text).join('\n'),
        lines,
      };
    } catch (error) {
      if (signal.aborted || error instanceof OcrCancelledError) {
        throw new OcrCancelledError();
      }
      if (error instanceof OcrError) throw error;

      throw new OcrError(
        this.recognizingStarted ? 'ocr-failed' : 'model-load-failed',
        this.recognizingStarted
          ? '文字認識に失敗しました。画像を変えて再試行してください。'
          : 'OCR用データを取得できませんでした。通信環境を確認して再試行してください。',
      );
    } finally {
      this.recognizing = false;
      this.progressSink = null;
      this.progressSignal = null;
      if (this.abortListener) {
        signal.removeEventListener('abort', this.abortListener);
        this.abortListener = null;
      }
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.progressSink = null;
    this.progressSignal = null;
    await this.terminateWorker();
  }

  private async terminateWorker(): Promise<void> {
    if (this.termination) return this.termination;
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      this.termination = worker.terminate().then(
        () => undefined,
        () => undefined,
      );
      await this.termination;
    }
  }
}

export async function createTesseractOcrEngine(
  options: OcrEngineOptions = {},
): Promise<OcrEngine> {
  return TesseractOcrEngine.create(options);
}

export const defaultOcrEngineFactory: OcrEngineFactory = (options) =>
  createTesseractOcrEngine(options);
