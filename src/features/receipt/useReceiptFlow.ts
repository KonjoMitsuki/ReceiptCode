import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createId } from '../../lib/id';
import {
  ImagePreparationError,
  prepareImage,
  revokePreparedImage,
  type PreparedImage,
} from '../../lib/imageProcessing';
import {
  defaultOcrEngineFactory,
  OcrCancelledError,
  OcrError,
  type OcrEngine,
  type OcrEngineFactory,
  type OcrProgress,
} from '../../lib/ocr';
import type { ReceiptItem, ReceiptSession } from '../../types/receipt';
import {
  canConfirmItem,
  getScannableItems,
  validationForJan,
} from './itemOperations';
import { parseReceipt } from './receiptParser';

export type FlowScreen =
  | 'upload'
  | 'preparing'
  | 'preview'
  | 'processing'
  | 'review'
  | 'barcode'
  | 'error';

export type FlowErrorKind = 'image' | 'model-load' | 'ocr' | 'unknown';

export interface FlowError {
  kind: FlowErrorKind;
  title: string;
  message: string;
  canRetry: boolean;
}

interface FlowState {
  screen: FlowScreen;
  prepared: PreparedImage | null;
  progress: OcrProgress | null;
  error: FlowError | null;
  session: ReceiptSession | null;
  barcodeItemId: string | null;
  manualAddOpen: boolean;
}

const initialState: FlowState = {
  screen: 'upload',
  prepared: null,
  progress: null,
  error: null,
  session: null,
  barcodeItemId: null,
  manualAddOpen: false,
};

function withItems(
  state: FlowState,
  updater: (items: ReceiptItem[]) => ReceiptItem[],
): FlowState {
  if (!state.session) return state;
  return {
    ...state,
    session: { ...state.session, items: updater(state.session.items) },
  };
}

function errorFromPreparation(error: unknown): FlowError {
  if (error instanceof ImagePreparationError) {
    return {
      kind: 'image',
      title: '画像を読み込めませんでした',
      message: error.message,
      canRetry: false,
    };
  }

  return {
    kind: 'image',
    title: '画像を読み込めませんでした',
    message:
      '画像の読み込みに失敗しました。JPEGまたはPNGの画像で再試行してください。',
    canRetry: false,
  };
}

export function useReceiptFlow(
  createOcrEngine: OcrEngineFactory = defaultOcrEngineFactory,
) {
  const [state, setState] = useState<FlowState>(initialState);
  const jobRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const engineRef = useRef<OcrEngine | null>(null);
  const preparedRef = useRef<PreparedImage | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      jobRef.current += 1;
      abortRef.current?.abort();
      revokePreparedImage(preparedRef.current);
      preparedRef.current = null;
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const isCurrent = useCallback(
    (job: number) => mountedRef.current && jobRef.current === job,
    [],
  );

  const replacePrepared = useCallback((next: PreparedImage | null) => {
    revokePreparedImage(preparedRef.current);
    preparedRef.current = next;
  }, []);

  const cancelCurrentWork = useCallback(() => {
    jobRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    void engineRef.current?.dispose();
  }, []);

  const selectImage = useCallback(
    async (file: File) => {
      cancelCurrentWork();
      replacePrepared(null);
      const job = jobRef.current;

      setState({
        ...initialState,
        screen: 'preparing',
      });

      try {
        const prepared = await prepareImage(file);
        if (!isCurrent(job)) {
          revokePreparedImage(prepared);
          return;
        }

        preparedRef.current = prepared;
        setState((current) => ({
          ...current,
          screen: 'preview',
          prepared,
          error: null,
        }));
      } catch (error) {
        if (!isCurrent(job)) return;
        setState((current) => ({
          ...current,
          screen: 'error',
          prepared: null,
          error: errorFromPreparation(error),
        }));
      }
    },
    [cancelCurrentWork, isCurrent, replacePrepared],
  );

  const startOcr = useCallback(async () => {
    const prepared = preparedRef.current;
    if (!prepared) return;

    cancelCurrentWork();
    const job = jobRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({
      ...current,
      screen: 'processing',
      progress: {
        stage: 'loading',
        ratio: 0.01,
        message: 'OCRを準備しています',
      },
      error: null,
      barcodeItemId: null,
    }));

    let engine: OcrEngine | null = null;

    try {
      engine = await createOcrEngine();
      if (controller.signal.aborted || !isCurrent(job)) {
        await engine.dispose();
        return;
      }
      engineRef.current = engine;

      const result = await engine.recognize(prepared.blob, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!isCurrent(job) || controller.signal.aborted) return;
          setState((current) => ({ ...current, progress }));
        },
      });

      if (!isCurrent(job) || controller.signal.aborted) return;

      const parsed = parseReceipt(result.text);
      const session: ReceiptSession = {
        id: parsed.items[0]?.receiptId ?? createId(),
        createdAt: new Date().toISOString(),
        items: parsed.items,
      };

      setState((current) => ({
        ...current,
        screen: 'review',
        progress: null,
        error: null,
        session,
        manualAddOpen: parsed.items.length === 0,
      }));
    } catch (error) {
      if (
        controller.signal.aborted ||
        !isCurrent(job) ||
        error instanceof OcrCancelledError
      ) {
        return;
      }

      if (error instanceof OcrError) {
        setState((current) => ({
          ...current,
          screen: 'error',
          progress: null,
          error: {
            kind: error.code === 'model-load-failed' ? 'model-load' : 'ocr',
            title:
              error.code === 'model-load-failed'
                ? 'OCR用データを取得できませんでした'
                : '文字認識に失敗しました',
            message: error.message,
            canRetry: true,
          },
        }));
        return;
      }

      setState((current) => ({
        ...current,
        screen: 'error',
        progress: null,
        error: {
          kind: 'unknown',
          title: '読み取りを完了できませんでした',
          message:
            '処理中に問題が発生しました。通信環境を確認して再試行してください。',
          canRetry: true,
        },
      }));
    } finally {
      if (engine) {
        await engine.dispose();
        if (engineRef.current === engine) engineRef.current = null;
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [cancelCurrentWork, createOcrEngine, isCurrent]);

  const cancelOcr = useCallback(() => {
    cancelCurrentWork();
    setState((current) => ({
      ...current,
      screen: current.prepared ? 'preview' : 'upload',
      progress: null,
      error: null,
    }));
  }, [cancelCurrentWork]);

  const goToUpload = useCallback(() => {
    cancelCurrentWork();
    replacePrepared(null);
    setState(initialState);
  }, [cancelCurrentWork, replacePrepared]);

  const startManual = useCallback(() => {
    cancelCurrentWork();
    const receiptId = createId();
    setState((current) => ({
      ...current,
      screen: 'review',
      error: null,
      progress: null,
      barcodeItemId: null,
      manualAddOpen: true,
      session: {
        id: receiptId,
        createdAt: new Date().toISOString(),
        items: [],
      },
    }));
  }, [cancelCurrentWork]);

  const updateItem = useCallback(
    (
      id: string,
      patch: Partial<Pick<ReceiptItem, 'name' | 'jan'>>,
    ) => {
      setState((current) =>
        withItems(current, (items) =>
          items.map((item) => {
            if (item.id !== id) return item;

            const janChanged =
              patch.jan !== undefined && patch.jan !== item.jan;
            const nextJan = patch.jan ?? item.jan;
            const nextName = patch.name ?? item.name;
            const { validation, format } = validationForJan(nextJan);

            let warnings = item.warnings;
            if (janChanged) {
              // JANを変えたら、以前のOCR行に基づく警告は引き継がない。
              warnings = warnings.filter((warning) =>
                warning.startsWith('商品名'),
              );
            }
            if (patch.name !== undefined && nextName.trim()) {
              warnings = warnings.filter(
                (warning) =>
                  !warning.includes('商品名を推定できませんでした'),
              );
            }

            return {
              ...item,
              name: nextName,
              jan: nextJan,
              format,
              validation: janChanged
                ? validation
                : item.validation === 'invalid'
                  ? validation
                  : item.validation,
              confirmed: false,
              warnings,
            };
          }),
        ),
      );
    },
    [],
  );

  const deleteItem = useCallback((id: string) => {
    setState((current) => {
      const next = withItems(current, (items) =>
        items.filter((item) => item.id !== id),
      );
      return next.barcodeItemId === id
        ? { ...next, screen: 'review', barcodeItemId: null }
        : next;
    });
  }, []);

  const addItem = useCallback((name: string, jan: string) => {
    setState((current) => {
      const receiptId = current.session?.id ?? createId();
      const createdAt =
        current.session?.createdAt ?? new Date().toISOString();
      const { validation, format } = validationForJan(jan);
      const item: ReceiptItem = {
        id: createId(),
        receiptId,
        name: name.trim(),
        jan,
        format,
        validation,
        confirmed: false,
        source: 'manual',
        warnings: [],
      };

      return {
        ...current,
        screen: 'review',
        manualAddOpen: false,
        error: null,
        session: {
          id: receiptId,
          createdAt,
          items: [...(current.session?.items ?? []), item],
        },
      };
    });
  }, []);

  const toggleConfirm = useCallback((id: string) => {
    setState((current) =>
      withItems(current, (items) =>
        items.map((item) => {
          if (item.id !== id || !canConfirmItem(item)) return item;
          return { ...item, confirmed: !item.confirmed };
        }),
      ),
    );
  }, []);

  const setManualAddOpen = useCallback((open: boolean) => {
    setState((current) => ({ ...current, manualAddOpen: open }));
  }, []);

  const openBarcode = useCallback((id: string) => {
    setState((current) => {
      if (!current.session) return current;
      const scannable = getScannableItems(current.session.items);
      if (!scannable.some((item) => item.id === id)) return current;
      return {
        ...current,
        screen: 'barcode',
        barcodeItemId: id,
        manualAddOpen: false,
      };
    });
  }, []);

  const closeBarcode = useCallback(() => {
    setState((current) => ({
      ...current,
      screen: 'review',
      barcodeItemId: null,
    }));
  }, []);

  const moveBarcode = useCallback((direction: -1 | 1) => {
    setState((current) => {
      if (!current.session || !current.barcodeItemId) return current;
      const scannable = getScannableItems(current.session.items);
      const index = scannable.findIndex(
        (item) => item.id === current.barcodeItemId,
      );
      const nextIndex = Math.min(
        scannable.length - 1,
        Math.max(0, index + direction),
      );
      const next = scannable[nextIndex];
      if (!next || next.id === current.barcodeItemId) return current;
      return { ...current, barcodeItemId: next.id };
    });
  }, []);

  const scannableItems = useMemo(
    () => (state.session ? getScannableItems(state.session.items) : []),
    [state.session],
  );

  const barcodeIndex = useMemo(
    () =>
      state.barcodeItemId
        ? scannableItems.findIndex(
            (item) => item.id === state.barcodeItemId,
          )
        : -1,
    [scannableItems, state.barcodeItemId],
  );

  const barcodeItem =
    barcodeIndex >= 0 ? scannableItems[barcodeIndex] : null;

  return {
    ...state,
    scannableItems,
    barcodeItem,
    barcodeIndex,
    selectImage,
    startOcr,
    cancelOcr,
    goToUpload,
    startManual,
    updateItem,
    deleteItem,
    addItem,
    toggleConfirm,
    setManualAddOpen,
    openBarcode,
    closeBarcode,
    moveBarcode,
  };
}

export type ReceiptFlow = ReturnType<typeof useReceiptFlow>;
