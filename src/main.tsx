import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root';
import type { OcrEngineFactory } from './lib/ocr';
import './styles.css';

const e2eOcrFactory: OcrEngineFactory | undefined =
  import.meta.env.VITE_E2E_OCR === 'true'
    ? async () => {
        const { createFixtureOcrEngine } = await import(
          './lib/testing/fixtureOcrEngine'
        );
        return createFixtureOcrEngine();
      }
    : undefined;

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

createRoot(root).render(
  <StrictMode>
    <Root createOcrEngine={e2eOcrFactory} />
  </StrictMode>,
);
