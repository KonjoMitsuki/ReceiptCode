import { useCallback, useState } from 'react';
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

  return (
    <main
      className={`barcode-screen${focusMode ? ' is-focus' : ''}`}
      aria-label="JANバーコード表示"
    >
      <header className="barcode-topbar">
        <span className="barcode-counter" aria-live="polite">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          className="button button-secondary button-compact"
          onClick={() => setFocusMode((current) => !current)}
          aria-pressed={focusMode}
        >
          {focusMode ? '集中表示を終了' : '集中表示'}
        </button>
      </header>

      <div className="barcode-main">
        {focusMode ? (
          <p className="focus-name" aria-live="polite">
            {item.name.trim() || '商品名未認識'}
          </p>
        ) : (
          <div className="barcode-heading">
            <p className="eyebrow">
              {format ? formatLabel(format) : 'JANバーコード'}
            </p>
            <h1>{item.name.trim() || '商品名未認識'}</h1>
            <p className="barcode-confirmed">確認済みの番号です</p>
          </div>
        )}

        <section className="barcode-sheet" aria-label="JANバーコード">
          <svg
            key={item.jan}
            ref={renderBarcode}
            className={`barcode-svg${renderError ? ' is-hidden' : ''}`}
            aria-label={`${format ?? 'JAN'} バーコード ${item.jan}`}
          />
          {renderError && (
            <p className="barcode-error" role="alert">
              {renderError}
            </p>
          )}
          <p className="barcode-number" aria-label={`JAN ${item.jan}`}>
            {item.jan}
          </p>
          {format && (
            <p className="barcode-format">{formatLabel(format)}</p>
          )}
        </section>

        {focusMode ? (
          <p className="focus-hint">
            読み取れない場合は、上の番号をレジに手入力してください。
          </p>
        ) : (
          <>
            <div className="scan-guidance">
              <p>
                レジのハンディスキャナーをバーコードに向けてください。
              </p>
              <ul>
                <li>画面の明るさを上げてください。</li>
                <li>横向きにすると大きく表示できます。</li>
                <li>
                  読み取れない場合は、表示中のJAN番号をレジに手入力してください。
                </li>
              </ul>
            </div>
            {wakeLockMessage && (
              <p className="wake-lock-note" role="status">
                {wakeLockMessage}
              </p>
            )}
          </>
        )}
      </div>

      <nav className="barcode-nav" aria-label="商品の切り替え">
        <button
          type="button"
          className="button button-secondary"
          disabled={!hasPrevious}
          onClick={onPrevious}
        >
          前へ
        </button>
        <button
          type="button"
          className="button button-quiet"
          onClick={onClose}
        >
          一覧に戻る
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!hasNext}
          onClick={onNext}
        >
          次へ
        </button>
      </nav>
    </main>
  );
}
