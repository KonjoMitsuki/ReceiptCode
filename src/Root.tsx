import { lazy, Suspense } from 'react';
import App from './App';
import type { OcrEngineFactory } from './lib/ocr';

const BenchmarkPage = lazy(() => import('./features/ocr-benchmark/BenchmarkPage'));

export default function Root({ createOcrEngine }: { createOcrEngine?: OcrEngineFactory }) {
  if (/\/dev\/ocr-benchmark(?:\/|\/index\.html)?$/.test(location.pathname)) {
    return <Suspense fallback={<p role="status">ベンチマークを読み込んでいます…</p>}>
      <BenchmarkPage createEngine={createOcrEngine ? async () => createOcrEngine() : undefined} />
    </Suspense>;
  }
  return <App createOcrEngine={createOcrEngine} />;
}
