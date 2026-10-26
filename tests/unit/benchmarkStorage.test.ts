// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { benchmarkStorage } from '../../src/features/ocr-benchmark/storage';
import type { BenchmarkRun, BenchmarkSample } from '../../src/features/ocr-benchmark/types';
const { deleteRun, deleteSample, load: loadBenchmarkData, saveRun, saveSamples } = benchmarkStorage;

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('receiptcode-ocr-benchmark');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe('端末内のベンチマーク保存', () => {
  it('画像・正解・履歴を再読込し、画像削除時は関連する実行だけ削除する', async () => {
    const samples: BenchmarkSample[] = ['a', 'b'].map((id) => ({
      id, name: `${id}.png`, image: new Blob([id], { type: 'image/png' }), createdAt: '2026-10-26', truth: { text: id, productNames: [], jans: [] },
    }));
    await saveSamples(samples);
    const run = (id: string, sampleId: string): BenchmarkRun => ({
      id, createdAt: '2026-10-26', imageStrategy: 'none', execution: 'sequential-fresh-engine', userAgent: 'test',
      results: [{ sampleId, sampleName: `${sampleId}.png`, inputBytes: 1, inputSha256: 'hash', engine: { id: 'tesseract', label: 'test', model: 'jpn', preprocessing: 'none', remote: false },
        truth: samples[0].truth, text: sampleId, status: 'success', timings: { initializationMs: 1, recognitionMs: 2, totalMs: 3 } }],
    });
    await saveRun(run('a-run', 'a'));
    await saveRun(run('b-run', 'b'));
    const loaded = await loadBenchmarkData();
    expect(await loaded.samples[0].image.text()).toBe('a');
    expect(loaded.runs).toHaveLength(2);
    await deleteSample('a');
    expect((await loadBenchmarkData()).samples.map((item) => item.id)).toEqual(['b']);
    expect((await loadBenchmarkData()).runs.map((item) => item.id)).toEqual(['b-run']);
    await deleteRun('b-run');
    expect((await loadBenchmarkData()).runs).toEqual([]);
  });
});
