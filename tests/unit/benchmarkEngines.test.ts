import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBenchmarkEngineFactory } from '../../src/features/ocr-benchmark/engines';
import { defaultOcrEngineFactory } from '../../src/lib/ocr';

const { createPaddle, createTesseract } = vi.hoisted(() => ({ createPaddle: vi.fn(), createTesseract: vi.fn() }));
vi.mock('@paddleocr/paddleocr-js', () => ({ PaddleOCR: { create: createPaddle } }));
vi.mock('tesseract.js', () => ({ createWorker: createTesseract, OEM: { LSTM_ONLY: 1 }, PSM: { AUTO: '3' } }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const options = () => ({ signal: new AbortController().signal, onProgress: vi.fn() });

describe('ローカルエンジンの契約', () => {
  it('比較はjpnのみ、通常フローは従来どおりjpn+engを使う', async () => {
    const worker = { setParameters: vi.fn(), recognize: vi.fn().mockResolvedValue({ data: { text: '牛乳' } }), terminate: vi.fn() };
    createTesseract.mockResolvedValue(worker);
    for (const engine of [await createBenchmarkEngineFactory(false)('tesseract'), await defaultOcrEngineFactory()]) {
      const result = await engine.recognize(new Blob(['image']), options());
      expect(result.text).toBe('牛乳');
      expect(result.timings?.recognitionMs).toBeGreaterThanOrEqual(0);
      await engine.dispose();
    }
    expect(createTesseract.mock.calls.map((call) => call[0])).toEqual([['jpn'], ['jpn', 'eng']]);
    expect(worker.terminate).toHaveBeenCalledTimes(2);
  });

  it('PP-OCRv5日本語モデルを公式Workerで初期化し、同一Blobを渡して終了する', async () => {
    const terminate = vi.fn();
    vi.stubGlobal('Worker', vi.fn(class { terminate = terminate; addEventListener = vi.fn(); }));
    const image = new Blob(['image'], { type: 'image/png' });
    const predict = vi.fn().mockResolvedValue([{ items: [{ text: '牛乳' }, { text: '4901234567894' }] }]);
    createPaddle.mockImplementation(async (config) => { config.worker.createWorker(); return { predict }; });
    const engine = await createBenchmarkEngineFactory(false)('paddle');
    const result = await engine.recognize(image, options());
    expect(result.text).toBe('牛乳\n4901234567894');
    expect(predict).toHaveBeenCalledWith(image);
    const config = createPaddle.mock.calls[0][0];
    expect(config).toMatchObject({ lang: 'japan', ocrVersion: 'PP-OCRv5', textDetectionModelName: 'PP-OCRv5_mobile_det', textRecognitionModelName: 'PP-OCRv5_mobile_rec' });
    for (const asset of [config.textDetectionModelAsset, config.textRecognitionModelAsset]) {
      const url = new URL(asset.url);
      expect(url.hostname).toBe('paddle-model-ecology.bj.bcebos.com');
      expect([...url.searchParams.entries()]).toEqual([['receiptcode-origin', location.origin]]);
    }
    expect(result.timings?.initializationMs).toBeGreaterThanOrEqual(0);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('Paddleの初期化待ちも中止時にWorkerを終了する', async () => {
    const terminate = vi.fn();
    vi.stubGlobal('Worker', vi.fn(class { terminate = terminate; addEventListener = vi.fn(); }));
    createPaddle.mockImplementation((config) => { config.worker.createWorker(); return new Promise(() => {}); });
    const controller = new AbortController();
    const engine = await createBenchmarkEngineFactory(false)('paddle');
    const recognition = engine.recognize(new Blob(['image']), { signal: controller.signal, onProgress: vi.fn() });
    await vi.waitFor(() => expect(Worker).toHaveBeenCalledOnce());
    const cancelled = expect(recognition).rejects.toThrow('キャンセル');
    controller.abort();
    await cancelled;
    expect(terminate).toHaveBeenCalledOnce();
  });
});
