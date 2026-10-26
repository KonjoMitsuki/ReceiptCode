import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBenchmarkEngineFactory } from '../../src/features/ocr-benchmark/engines';
import { defaultOcrEngineFactory } from '../../src/lib/ocr';
import { PaddleEngine } from '../../src/features/ocr-benchmark/paddleEngine';

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

  it('画面側ではSDK本体を初期化せず軽量Workerクライアントを生成する', async () => {
    const engine = await createBenchmarkEngineFactory(false)('paddle');
    expect(engine).toBeInstanceOf(PaddleEngine);
    expect(createPaddle).not.toHaveBeenCalled();
  });

  it('必要な画像処理APIがない場合は説明付きエラーを返す', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const engine = await createBenchmarkEngineFactory(false)('paddle');
    await expect(engine.recognize(new Blob(['image']), options())).rejects.toThrow('対応していません');
    expect(createPaddle).not.toHaveBeenCalled();
  });
});
