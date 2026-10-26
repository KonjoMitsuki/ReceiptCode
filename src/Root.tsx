import { lazy, Suspense } from 'react';
import App from './App';
import type { OcrEngineFactory } from './lib/ocr';

const BenchmarkPage = lazy(() => import('./features/ocr-benchmark/BenchmarkPage'));

export default function Root({ createOcrEngine }: { createOcrEngine?: OcrEngineFactory }) {
  if (!new URLSearchParams(location.search).has('receipt-flow')) {
    return <Suspense fallback={<p role="status">ベンチマークを読み込んでいます…</p>}>
      <BenchmarkPage createEngine={createOcrEngine ? async () => createOcrEngine() : undefined} />
    </Suspense>;
  }
  return <App createOcrEngine={createOcrEngine} />;
}
