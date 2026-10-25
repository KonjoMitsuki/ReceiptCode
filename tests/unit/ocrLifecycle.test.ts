import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PSM } from 'tesseract.js';
import {
  createTesseractOcrEngine,
  OcrCancelledError,
} from '../../src/lib/ocr';

const mocks = vi.hoisted(() => ({ createWorker: vi.fn() }));
vi.mock('tesseract.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('tesseract.js')>(),
  createWorker: mocks.createWorker,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function worker() {
  return {
    setParameters: vi.fn(async () => undefined),
    recognize: vi.fn(async () => ({ data: {
      text: '牛乳',
      tsv: '5\t1\t1\t1\t1\t1\t10\t10\t40\t20\t90\t牛乳',
    } })),
    terminate: vi.fn(async (): Promise<void> => undefined),
  };
}

describe('OCR worker lifecycle', () => {
  beforeEach(() => mocks.createWorker.mockReset());

  it('workerを再利用し、終了は一度だけ行う', async () => {
    const fake = worker();
    mocks.createWorker.mockResolvedValue(fake);
    const engine = await createTesseractOcrEngine({ language: 'jpn' });
    const options = {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      pageSegMode: PSM.SINGLE_BLOCK,
    };
    await engine.recognize(new Blob(), options);
    await engine.recognize(new Blob(), options);
    expect(mocks.createWorker).toHaveBeenCalledTimes(1);
    expect(mocks.createWorker.mock.calls[0][0]).toEqual(['jpn']);
    expect(fake.recognize).toHaveBeenCalledTimes(2);
    expect(fake.setParameters).toHaveBeenLastCalledWith({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    await engine.dispose();
    await engine.dispose();
    expect(fake.terminate).toHaveBeenCalledTimes(1);
  });

  it('ロード中にキャンセルしたら遅れて生成されたworkerを終了する', async () => {
    const pending = deferred<ReturnType<typeof worker>>();
    const fake = worker();
    mocks.createWorker.mockReturnValue(pending.promise);
    const controller = new AbortController();
    const creation = createTesseractOcrEngine({ signal: controller.signal });
    const rejection = expect(creation).rejects.toBeInstanceOf(OcrCancelledError);
    controller.abort();
    pending.resolve(fake);
    await rejection;
    expect(fake.terminate).toHaveBeenCalledTimes(1);
    expect(fake.recognize).not.toHaveBeenCalled();
  });

  it('認識中のキャンセルは即時終了し、disposeも終了完了を待つ', async () => {
    const fake = worker();
    const pending = deferred<Awaited<ReturnType<typeof fake.recognize>>>();
    const termination = deferred<void>();
    fake.recognize.mockReturnValue(pending.promise);
    fake.terminate.mockReturnValue(termination.promise);
    mocks.createWorker.mockResolvedValue(fake);
    const engine = await createTesseractOcrEngine();
    const controller = new AbortController();
    const recognition = engine.recognize(new Blob(), {
      signal: controller.signal, onProgress: vi.fn(),
    });
    await vi.waitFor(() => expect(fake.recognize).toHaveBeenCalled());
    const rejection = expect(recognition).rejects.toBeInstanceOf(OcrCancelledError);
    controller.abort();
    await rejection;
    let disposed = false;
    const disposal = engine.dispose().then(() => { disposed = true; });
    await Promise.resolve();
    expect(fake.terminate).toHaveBeenCalledTimes(1);
    expect(disposed).toBe(false);
    termination.resolve();
    await disposal;
    expect(disposed).toBe(true);
  });
});
