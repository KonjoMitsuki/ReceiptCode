// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { noSplitStrategy, runBenchmark, validateTruth } from '../../src/features/ocr-benchmark/runner';
import type { BenchmarkEngineFactory, BenchmarkSample, EngineId } from '../../src/features/ocr-benchmark/types';

const sample = (): BenchmarkSample => ({
  id: 'sample', name: 'test.png', image: new Blob(['original bytes'], { type: 'image/png' }),
  createdAt: '2026-10-26T00:00:00Z', truth: { text: '牛乳', jans: [], productNames: [] },
});

describe('ベンチマーク実行条件', () => {
  it('原Blobを各エンジンへ順次渡し、初期化・認識・終了時間を分ける', async () => {
    const input = sample();
    const order: string[] = [];
    const createEngine: BenchmarkEngineFactory = async (id) => {
      order.push(`create:${id}`);
      return {
        recognize: async (image) => {
          expect(image).toBe(input.image);
          order.push(`recognize:${id}`);
          return { text: '牛乳', timings: { initializationMs: 2, recognitionMs: 3 } };
        },
        dispose: async () => { order.push(`dispose:${id}`); },
      };
    };
    expect((await noSplitStrategy.prepare(input.image))[0]).toBe(input.image);
    const run = await runBenchmark({ samples: [input], engineIds: ['tesseract', 'paddle'], createEngine, signal: new AbortController().signal });
    expect(order).toEqual(['create:tesseract', 'recognize:tesseract', 'dispose:tesseract', 'create:paddle', 'recognize:paddle', 'dispose:paddle']);
    expect(run.imageStrategy).toBe('none');
    expect(run.results).toHaveLength(2);
    expect(new Set(run.results.map((result) => result.inputSha256)).size).toBe(1);
    expect(run.results[0].inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(run.results.every((result) => result.status === 'success' && result.accuracy?.cer === 0)).toBe(true);
    expect(run.results[0].timings.initializationMs).toBeGreaterThanOrEqual(2);
    expect(run.results[0].timings.recognitionMs).toBe(3);
    input.truth.text = '変更';
    expect(run.results[0].truth.text).toBe('牛乳');
  });

  it('一部のエラーで他を止めず、終了処理も必ず試みる', async () => {
    const dispose = vi.fn(async () => undefined);
    const createEngine: BenchmarkEngineFactory = async (id) => ({
      recognize: async () => { if (id === 'tesseract') throw new Error('failure'); return { text: '牛乳' }; }, dispose,
    });
    const run = await runBenchmark({ samples: [sample()], engineIds: ['tesseract', 'paddle'], createEngine, signal: new AbortController().signal });
    expect(run.results.map((result) => result.status)).toEqual(['error', 'success']);
    expect(run.results[0].accuracy).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('中止後は次のエンジンに送信しない', async () => {
    const controller = new AbortController();
    const called: EngineId[] = [];
    const run = await runBenchmark({ samples: [sample()], engineIds: ['tesseract', 'google'], signal: controller.signal,
      createEngine: async (id) => {
        called.push(id);
        return { recognize: async () => { controller.abort(); throw new Error('aborted'); }, dispose: async () => undefined };
      },
    });
    expect(called).toEqual(['tesseract']);
    expect(run.results[0].status).toBe('cancelled');
    expect(run.results[0].accuracy).toBeUndefined();
  });

  it('正解未登録・JAN形式・未対応の分割を検証する', async () => {
    const input = sample();
    input.truth.text = '';
    expect(validateTruth(input)).toBeNull();
    const run = await runBenchmark({ samples: [input], engineIds: ['tesseract'],
      createEngine: async () => ({ recognize: async () => ({ text: '牛乳' }), dispose: async () => undefined }),
      signal: new AbortController().signal,
    });
    expect(run.results[0]).toMatchObject({ status: 'success', text: '牛乳', truth: { text: '' } });
    expect(run.results[0].accuracy).toBeUndefined();
    input.truth.text = '牛乳';
    input.truth.jans = ['１２３４５６７８'];
    expect(validateTruth(input)).toContain('半角数字');
    input.truth.jans = [];
    const createEngine = vi.fn();
    await expect(runBenchmark({ samples: [input], engineIds: ['tesseract'], createEngine, signal: new AbortController().signal,
      strategy: { id: 'future-auto', prepare: async (image) => [image, image] },
    })).rejects.toThrow('正解対応付け');
    expect(createEngine).not.toHaveBeenCalled();
  });
});
