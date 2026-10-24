import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from './AppHeader';
import {
  BarcodeRenderError,
  renderBarcodeSvg,
} from '../lib/barcode';
import { formatLabel, validateJan } from '../lib/jan';
import type { ReceiptItem } from '../types/receipt';
import { useWakeLock } from '../hooks/useWakeLock';

interface BarcodeViewerProps {
  item: ReceiptItem;
  index: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function BarcodeViewer({
  item,
  index,
  total,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onClose,
}: BarcodeViewerProps) {
  const screenRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const wakeLockStatus = useWakeLock(true);

  const validation = validateJan(item.jan);
  const format = validation.format ?? item.format;

  // JsBarcode はDOMへ直接描画する。key={item.jan} でSVGが作り直された際に
  // callback ref から描画し、描画失敗時だけ画面へ理由を出す。
  const renderBarcode = useCallback(
    (svg: SVGSVGElement | null) => {
      if (!svg) return;
      try {
        renderBarcodeSvg(svg, item.jan);
        setRenderError(null);
      } catch (error) {
        setRenderError(
          error instanceof BarcodeRenderError
            ? error.message
            : 'バーコードを描画できませんでした。番号を確認してください。',
        );
      }
    },
    [item.jan],
  );

  const wakeLockMessage =
    wakeLockStatus === 'active'
      ? '画面の自動ロックを防いでいます。'
      : wakeLockStatus === 'unsupported'
        ? 'このブラウザは画面の自動ロック防止に対応していません。端末の自動ロック設定にご注意ください。'
        : wakeLockStatus === 'unavailable'
          ? '画面の自動ロック防止を開始できませんでした。端末の自動ロック設定にご注意ください。'
          : null;

  useEffect(() => {
    mainRef.current?.focus();
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFocus = async () => {
    setFocusMode(!focusMode);
    try {
      if (focusMode && document.fullscreenElement === screenRef.current) {
        await document.exitFullscreen();
      } else if (!focusMode && screenRef.current?.requestFullscreen) {
        await screenRef.current.requestFullscreen();
      }
    } catch {
      // Fullscreen is optional (e.g. iPhone Safari); focused viewing still works.
    }
  };

  const close = async () => {
    try {
      if (document.fullscreenElement === screenRef.current) await document.exitFullscreen();
    } catch { /* Returning to the list must work even if fullscreen exit fails. */ }
    onClose();
  };

  return (
    <div className={`app barcode-app${focusMode ? ' is-focus' : ''}`} ref={screenRef}>
      {!focusMode && <AppHeader />}
    <main ref={mainRef} tabIndex={-1}
      className={`screen barcode-screen${focusMode ? ' is-focus' : ''}`}
      aria-label="JANバーコード表示"
    >
      {!focusMode && <button type="button" className="button button-quiet back-link" onClick={() => void close()}>‹ 商品一覧</button>}
      <div className="barcode-main">
        {focusMode ? (
          <p className="focus-name" aria-live="polite">{item.name.trim() || '商品名未認識'}</p>
        ) : (
          <div className="barcode-heading">
            <h1>{item.name.trim() || '商品名未認識'}</h1>
            <p>{format ? `JAN / ${format === 'EAN13' ? 'EAN-13' : 'EAN-8'}` : 'JANバーコード'}</p>
          </div>
        )}
        <section className="barcode-sheet" aria-label="JANバーコード">
          {!focusMode && <h2>バーコード</h2>}
          <svg key={item.jan} ref={renderBarcode}
            className={`barcode-svg${renderError ? ' is-hidden' : ''}`}
            aria-label={`${format ?? 'JAN'} バーコード ${item.jan}`} />
          {renderError && <p className="barcode-error" role="alert">{renderError}</p>}
          <p className="barcode-number" aria-label={`JAN ${item.jan}`}>{item.jan}</p>
          {!focusMode && <p className="barcode-caption">レジでこの画面を提示してください</p>}
        </section>
        {focusMode && <p className="focus-hint">読み取れない場合は、上の番号をレジに手入力してください。</p>}
      </div>
      <div className="barcode-actions">
        <button type="button" className="button button-primary" onClick={() => void toggleFocus()} aria-pressed={focusMode}>
          {focusMode ? '集中表示を終了' : '全画面で表示'}
        </button>
        {!focusMode && <button type="button" className="button button-secondary" onClick={() => void close()}>別の商品を見る</button>}
      </div>
      <nav className="barcode-nav" aria-label="商品の切り替え">
        <button type="button" className="button button-secondary" disabled={!hasPrevious} onClick={onPrevious}>前へ</button>
        <span className="barcode-counter" aria-live="polite">{index + 1} / {total}</span>
        <button type="button" className="button button-secondary" disabled={!hasNext} onClick={onNext}>次へ</button>
      </nav>
      <button type="button" className="button button-quiet" onClick={() => void close()}>一覧に戻る</button>
      {!focusMode && <>
        <details className="scan-guidance">
          <summary>読み取りのヒント</summary>
          <p>レジのハンディスキャナーをバーコードに向けてください。</p>
          <ul>
            <li>画面の明るさを上げてください。</li>
            <li>横向きにすると大きく表示できます。</li>
            <li>読み取れない場合は、表示中のJAN番号をレジに手入力してください。</li>
          </ul>
          {format && <p>{formatLabel(format)}</p>}
        </details>
        {wakeLockMessage && <p className="wake-lock-note" role="status">{wakeLockMessage}</p>}
      </>}
    </main>
    </div>
  );
}
