import type { OcrEngine } from '../../lib/ocr';

export type EngineId = 'tesseract' | 'paddle' | 'google';

export interface GroundTruth {
  text: string;
  productNames: string[];
  jans: string[];
}

export interface BenchmarkSample {
  id: string;
  name: string;
  image: Blob;
  createdAt: string;
  truth: GroundTruth;
}

export interface Accuracy {
  characterErrors: number;
  characters: number;
  cer: number | null;
  janMatches: number;
  janCount: number;
  janAccuracy: number | null;
  productMatches: number;
  productCount: number;
  productAccuracy: number | null;
}

export interface EngineDescriptor {
  id: EngineId;
  label: string;
  model: string;
  preprocessing: string;
  remote: boolean;
}

export interface BenchmarkResult {
  sampleId: string;
  sampleName: string;
  inputSha256: string;
  inputBytes: number;
  engine: EngineDescriptor;
  truth: GroundTruth;
  status: 'success' | 'error' | 'cancelled';
  text: string;
  error?: string;
  accuracy?: Accuracy;
  timings: {
    initializationMs: number | null;
    recognitionMs: number | null;
    totalMs: number;
  };
}

export interface BenchmarkRun {
  id: string;
  createdAt: string;
  imageStrategy: string;
  execution: 'sequential-fresh-engine';
  userAgent: string;
  results: BenchmarkResult[];
}

/** 分割方式を将来追加しても、各エンジンに同じ分割画像を渡せる境界。 */
export interface ImageStrategy {
  id: string;
  prepare(image: Blob): Promise<Blob[]>;
}

export type BenchmarkEngineFactory = (id: EngineId) => Promise<OcrEngine>;
