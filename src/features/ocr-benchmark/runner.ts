import { createId } from '../../lib/id';
import { ENGINES } from './engines';
import { evaluate } from './metrics';
import type { BenchmarkEngineFactory, BenchmarkRun, BenchmarkSample, EngineId, ImageStrategy } from './types';
import type { OcrEngine, OcrProgress, OcrResult } from '../../lib/ocr';

export const noSplitStrategy: ImageStrategy = {
  id: 'none', prepare: async (image) => [image],
};

export function validateTruth(sample: BenchmarkSample): string | null {
  if (!sample.truth.text.trim()) return `${sample.name}: 正解テキストを入力してください。`;
  if (Array.from(sample.truth.text).length > 10_000) return `${sample.name}: 正解テキストは10,000文字以内にしてください。`;
  if (sample.truth.jans.some((jan) => !/^(?:\d{8}|\d{13})$/.test(jan))) {
    return `${sample.name}: 正解JANは半角数字8桁または13桁で入力してください。`;
  }
  return null;
}

export async function runBenchmark(options: {
  samples: BenchmarkSample[];
  engineIds: EngineId[];
  createEngine: BenchmarkEngineFactory;
  signal: AbortSignal;
  strategy?: ImageStrategy;
  onProgress?: (message: string, progress?: OcrProgress) => void;
  onResult?: (run: BenchmarkRun) => void;
}): Promise<BenchmarkRun> {
  const { samples, engineIds, createEngine, signal, onProgress, onResult } = options;
  const strategy = options.strategy ?? noSplitStrategy;
  if (!samples.length || !engineIds.length) throw new Error('画像とエンジンを1つ以上選択してください。');
  for (const sample of samples) {
    const error = validateTruth(sample);
    if (error) throw new Error(error);
  }
  const run: BenchmarkRun = {
    id: createId(), createdAt: new Date().toISOString(), imageStrategy: strategy.id,
    execution: 'sequential-fresh-engine', userAgent: navigator.userAgent, results: [],
  };
  for (const sample of samples) {
    if (signal.aborted) break;
    // 分割方式はエンジンループの外側で一度だけ適用する。
    const images = await strategy.prepare(sample.image);
    // 分割評価時の正解対応付けなしに全文と照合することを防ぐ。
    if (images.length !== 1) throw new Error('複数分割の評価には分割ごとの正解対応付けが必要です。');
    for (const [part, image] of images.entries()) {
      if (signal.aborted) break;
      const digest = await crypto.subtle.digest('SHA-256', await image.arrayBuffer());
      const inputSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      for (const id of engineIds) {
        if (signal.aborted) break;
        const descriptor = ENGINES.find((engine) => engine.id === id);
        if (!descriptor) throw new Error('不明なエンジンです。');
        onProgress?.(`${sample.name} / ${descriptor.label}`);
        let engine: OcrEngine | undefined;
        let output: OcrResult | undefined;
        let error: string | undefined;
        let factoryMs = 0;
        const started = performance.now();
        try {
          engine = await createEngine(id);
          factoryMs = performance.now() - started;
          if (signal.aborted) throw new Error('cancelled');
          output = await engine.recognize(image, {
            signal, onProgress: (progress) => onProgress?.(`${sample.name} / ${descriptor.label}: ${progress.message}`, progress),
          });
        } catch (cause) {
          error = signal.aborted ? 'キャンセルしました。' : cause instanceof Error ? cause.message : 'OCRに失敗しました。';
        } finally {
          try { await engine?.dispose(); } catch { error ??= 'OCRエンジンの終了処理に失敗しました。'; }
        }
        const totalMs = performance.now() - started;
        run.results.push({
          sampleId: sample.id, sampleName: images.length > 1 ? `${sample.name} #${part + 1}` : sample.name,
          inputSha256, inputBytes: image.size, engine: { ...descriptor },
          truth: structuredClone(sample.truth), text: output?.text ?? '',
          status: signal.aborted ? 'cancelled' : error ? 'error' : 'success', error,
          accuracy: output && !error && !signal.aborted ? evaluate(sample.truth, output.text) : undefined,
          timings: {
            initializationMs: output?.timings ? factoryMs + output.timings.initializationMs : null,
            recognitionMs: output?.timings?.recognitionMs ?? null, totalMs,
          },
        });
        onResult?.({ ...run, results: [...run.results] });
      }
    }
  }
  return run;
}
