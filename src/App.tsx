// @icons receipt_long light_mode dark_mode lock barcode keyboard photo_camera fact_check document_scanner schedule photo_library refresh search_off add close error warning check check_circle help verified fullscreen fullscreen_exit arrow_back arrow_forward list image downloading delete
import { useEffect } from 'react';
import { AppBar } from './components/m3e/app-bar';
import { Button } from './components/m3e/button';
import { useColorMode } from './components/m3e/color-mode-provider';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './components/m3e/empty';
import { Icon } from './components/m3e/icon';
import { M3eProvider } from './components/m3e/m3e-provider';
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
  const { resolvedMode, toggleMode } = useColorMode();
  const dark = resolvedMode === 'dark';

  return (
    <AppBar
      className="sticky top-0 z-40 border-b border-outline-variant/50 bg-surface/88 backdrop-blur-xl"
      title={<span className="font-semibold">Receipt2JAN</span>}
      subtitle="端末内OCR・バーコード表示"
      leading={
        <span className="ml-2 grid size-10 place-items-center rounded-xl bg-primary text-on-primary shadow-elevation-1">
          <Icon name="receipt_long" size={22} />
        </span>
      }
      trailing={
        <Button
          variant="text"
          size="icon"
          className="size-11"
          aria-label={
            dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'
          }
          onClick={toggleMode}
        >
          <Icon name={dark ? 'light_mode' : 'dark_mode'} />
        </Button>
      }
    />
  );
}

function AppContent({ createOcrEngine }: AppProps) {
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
        <div className="flex min-h-dvh flex-col bg-surface">
          <BrandHeader />
          <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-10">
            <Empty className="rounded-3xl bg-surface-container-low">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="size-14 rounded-full">
                  <Icon name="barcode" size={28} />
                </EmptyMedia>
                <EmptyTitle>
                  <h1 className="text-headline-small-emphasized">
                    表示できるバーコードがありません
                  </h1>
                </EmptyTitle>
                <EmptyDescription>
                  一覧に戻ってJANを確認してください。
                </EmptyDescription>
              </EmptyHeader>
              <Button size="md" onClick={flow.closeBarcode}>
                一覧に戻る
              </Button>
            </Empty>
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
    <div className="flex min-h-dvh flex-col bg-surface">
      <BrandHeader />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {flow.screen === 'upload' && (
          <ReceiptUploader
            onFileSelected={(file) => void flow.selectImage(file)}
            onManualStart={flow.startManual}
          />
        )}

        {flow.screen === 'preparing' && (
          <main className="screen center-screen flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <span className="grid size-24 place-items-center rounded-full bg-primary-container">
              <span className="spinner block size-11 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-hidden="true" />
            </span>
            <h1 className="text-headline-small-emphasized">
              画像を準備しています
            </h1>
            <p className="lead max-w-sm text-body-large text-on-surface-variant">
              画像の向きとサイズを端末内で整えています。
            </p>
            <Button variant="outlined" size="md" onClick={flow.goToUpload}>
              中止
            </Button>
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
      </div>

      {flow.screen !== 'preparing' && (
        <footer className="app-footer mx-auto mt-auto flex w-full max-w-3xl items-center justify-center gap-2 px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-body-small text-on-surface-variant">
          <Icon name="lock" size={16} />
          写真・OCR結果は外部送信されません
        </footer>
      )}
    </div>
  );
}

function App({ createOcrEngine }: AppProps) {
  return (
    <M3eProvider
      theme={{
        defaultTheme: {
          source: { primary: '#0d5b4a' },
          variant: 'tonalSpot',
          motion: 'expressive',
          shapeScale: 1,
        },
      }}
    >
      <AppContent createOcrEngine={createOcrEngine} />
    </M3eProvider>
  );
}

export default App;
