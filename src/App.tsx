import { useEffect } from 'react';
import { BarcodeViewer } from './components/BarcodeViewer';
import { ErrorPanel } from './components/ErrorPanel';
import { ImagePreview } from './components/ImagePreview';
import { ItemList } from './components/ItemList';
import { OcrProgress } from './components/OcrProgress';
import { ReceiptUploader } from './components/ReceiptUploader';
import { useReceiptFlow } from './features/receipt/useReceiptFlow';
import type { OcrEngineFactory } from './lib/ocr';

interface AppProps {
  createOcrEngine?: OcrEngineFactory;
}

function BrandHeader() {
  return (
    <header className="app-header">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="brand-name">Receipt2JAN</span>
      <span className="brand-tag">端末内OCR</span>
    </header>
  );
}

function App({ createOcrEngine }: AppProps) {
  const flow = useReceiptFlow(createOcrEngine);
  const hasItems = Boolean(flow.session?.items.length);

  useEffect(() => {
    document.title =
      flow.screen === 'barcode'
        ? 'バーコード表示 | Receipt2JAN'
        : flow.screen === 'processing'
          ? '読み取り中 | Receipt2JAN'
          : 'Receipt2JAN';
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [flow.screen]);

  useEffect(() => {
    if (!hasItems) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasItems]);

  const chooseAnother = () => {
    if (
      hasItems &&
      !window.confirm(
        '現在の読み取り結果を破棄して、画像を選び直しますか？',
      )
    ) {
      return;
    }
    flow.goToUpload();
  };

  if (flow.screen === 'barcode') {
    if (!flow.barcodeItem) {
      return (
        <div className="app">
          <BrandHeader />
          <main className="screen">
            <section className="empty-card">
              <h1>表示できるバーコードがありません</h1>
              <p>一覧に戻ってJANを確認してください。</p>
              <button
                type="button"
                className="button button-primary"
                onClick={flow.closeBarcode}
              >
                一覧に戻る
              </button>
            </section>
          </main>
        </div>
      );
    }

    return (
      <BarcodeViewer
        item={flow.barcodeItem}
        index={flow.barcodeIndex}
        total={flow.scannableItems.length}
        hasPrevious={flow.barcodeIndex > 0}
        hasNext={flow.barcodeIndex < flow.scannableItems.length - 1}
        onPrevious={() => flow.moveBarcode(-1)}
        onNext={() => flow.moveBarcode(1)}
        onClose={flow.closeBarcode}
      />
    );
  }

  return (
    <div className="app">
      <BrandHeader />

      {flow.screen === 'upload' && (
        <ReceiptUploader
          onFileSelected={(file) => void flow.selectImage(file)}
          onManualStart={flow.startManual}
        />
      )}

      {flow.screen === 'preparing' && (
        <main className="screen center-screen">
          <div className="spinner" aria-hidden="true" />
          <h1>画像を準備しています</h1>
          <p className="lead">画像の向きとサイズを端末内で整えています。</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={flow.goToUpload}
          >
            中止
          </button>
        </main>
      )}

      {flow.screen === 'preview' && flow.prepared && (
        <ImagePreview
          image={flow.prepared}
          onStartOcr={() => void flow.startOcr()}
          onChooseAnother={chooseAnother}
          onManualStart={flow.startManual}
        />
      )}

      {flow.screen === 'processing' && flow.prepared && flow.progress && (
        <OcrProgress
          image={flow.prepared}
          progress={flow.progress}
          onCancel={flow.cancelOcr}
        />
      )}

      {flow.screen === 'review' && (
        <ItemList
          items={flow.session?.items ?? []}
          manualAddOpen={flow.manualAddOpen}
          hasPreparedImage={Boolean(flow.prepared)}
          onUpdateItem={flow.updateItem}
          onDeleteItem={flow.deleteItem}
          onToggleConfirm={flow.toggleConfirm}
          onShowBarcode={flow.openBarcode}
          onAddItem={flow.addItem}
          onManualAddOpenChange={flow.setManualAddOpen}
          onChooseAnother={chooseAnother}
          onRetryOcr={() => void flow.startOcr()}
        />
      )}

      {flow.screen === 'error' && flow.error && (
        <ErrorPanel
          error={flow.error}
          onRetry={() => void flow.startOcr()}
          onChooseAnother={flow.goToUpload}
          onManualStart={flow.startManual}
        />
      )}

      {flow.screen !== 'preparing' && (
        <footer className="app-footer">
          写真・OCR結果は外部送信されません
        </footer>
      )}
    </div>
  );
}

export default App;
