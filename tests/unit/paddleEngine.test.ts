import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaddleEngine } from '../../src/features/ocr-benchmark/paddleEngine';
import { OcrCancelledError } from '../../src/lib/ocr';

class FakeWorker extends EventTarget {
  static latest: FakeWorker;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { super(); FakeWorker.latest = this; }
  reply(payload: unknown, status = 'success') {
    const [request] = this.postMessage.mock.lastCall!;
    this.dispatchEvent(new MessageEvent('message', { data: { kind: 'worker-transport-response', requestId: request.requestId, status, payload } }));
  }
}

describe('Paddle Workerの省メモリ実行と終了処理', () => {
  const bitmap = { width: 640, height: 960, close: vi.fn() };
  let controller: AbortController;
  let engine: PaddleEngine;
  const recognize = () => engine.recognize(new Blob(['receipt']), { signal: controller.signal, onProgress: vi.fn() });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    bitmap.close.mockClear();
    controller = new AbortController();
    engine = new PaddleEngine();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('推論サイズとバッチを制限し、元画像のBitmapを転送して成功後に資源を解放する', async () => {
    const image = new Blob(['original']);
    const pending = engine.recognize(image, { signal: controller.signal, onProgress: vi.fn() });
    const worker = FakeWorker.latest;
    const [init] = worker.postMessage.mock.calls[0];
    expect(init.payload.options.pipelineConfig).toMatchObject({
      textRecognitionBatchSize: 1,
      runtimeDefaults: { text_det_limit_side_len: 960, text_det_limit_type: 'max', text_det_max_side_limit: 960 },
      modelSelection: { textDetectionModelName: 'PP-OCRv5_mobile_det', textRecognitionModelName: 'PP-OCRv5_mobile_rec' },
    });
    for (const asset of Object.values(init.payload.options.pipelineConfig.assets) as { url: string }[]) {
      const url = new URL(asset.url);
      expect(url.hostname).toBe('paddle-model-ecology.bj.bcebos.com');
      expect([...url.searchParams.entries()]).toEqual([['receiptcode-origin', location.origin]]);
    }
    worker.reply({});
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2));
    expect(createImageBitmap).toHaveBeenCalledWith(image);
    expect(worker.postMessage.mock.lastCall?.[1]).toEqual([bitmap]);
    worker.reply([{ items: [{ text: '牛乳' }, { text: '4901234567894' }] }]);
    expect(await pending).toMatchObject({ text: '牛乳\n4901234567894', timings: { initializationMs: expect.any(Number), recognitionMs: expect.any(Number) } });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it.each(['error', 'messageerror'])('%sで待機を終了しWorkerを解放する', async (event) => {
    const pending = recognize();
    const assertion = expect(pending).rejects.toThrow('Workerが停止');
    FakeWorker.latest.dispatchEvent(new Event(event));
    await assertion;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it('無応答のWorkerを終了し再実行できる', async () => {
    const pending = recognize();
    const assertion = expect(pending).rejects.toThrow('時間内に応答');
    const worker = FakeWorker.latest;
    await vi.advanceTimersByTimeAsync(180_000);
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const retry = recognize();
    const cancelled = expect(retry).rejects.toBeInstanceOf(OcrCancelledError);
    controller.abort();
    await cancelled;
    expect(FakeWorker.latest).not.toBe(worker);
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it('画像デコード中の中止でもBitmapを解放し認識を開始しない', async () => {
    let complete!: (value: typeof bitmap) => void;
    vi.mocked(createImageBitmap).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const pending = recognize();
    const assertion = expect(pending).rejects.toBeInstanceOf(OcrCancelledError);
    FakeWorker.latest.reply({});
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalled());
    controller.abort();
    complete(bitmap);
    await assertion;
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(FakeWorker.latest.postMessage).toHaveBeenCalledOnce();
  });

  it('不正な結果は表示に渡さずエラーにする', async () => {
    const pending = recognize();
    const assertion = expect(pending).rejects.toThrow('認識結果が不正');
    FakeWorker.latest.reply({});
    await vi.waitFor(() => expect(FakeWorker.latest.postMessage).toHaveBeenCalledTimes(2));
    FakeWorker.latest.reply([{ items: [{ text: null }] }]);
    await assertion;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
});
