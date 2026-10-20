import { useCallback, useState } from 'react';
import {
  BarcodeRenderError,
  renderBarcodeSvg,
} from '../lib/barcode';
import { formatLabel, validateJan } from '../lib/jan';
import type { ReceiptItem } from '../types/receipt';
import { useWakeLock } from '../hooks/useWakeLock';
import { Badge } from './m3e/badge';
import { Button } from './m3e/button';
import { Icon } from './m3e/icon';

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
      className={`barcode-screen mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-2 px-3 py-2 sm:px-5 sm:py-4${focusMode ? ' is-focus' : ''}`}
      aria-label="JANバーコード表示"
    >
      <header className="barcode-topbar flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="barcode-counter font-mono text-title-medium font-semibold tabular-nums">
            {index + 1} / {total}
          </span>
          {format && (
            <Badge
              variant="outline"
              className="hidden border-neutral-300 text-neutral-600 sm:inline-flex"
            >
              {formatLabel(format)}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="outlined"
          size="sm"
          className="h-11 border-neutral-300 text-neutral-800"
          onClick={() => setFocusMode((current) => !current)}
          aria-pressed={focusMode}
        >
          <Icon name={focusMode ? 'fullscreen_exit' : 'fullscreen'} size={18} />
          {focusMode ? '集中表示を終了' : '集中表示'}
        </Button>
      </header>

      <div className="barcode-main flex flex-1 flex-col items-center justify-center gap-3 py-1">
        {focusMode ? (
          <p
            className="focus-name text-title-large-emphasized text-center"
            aria-live="polite"
          >
            {item.name.trim() || '商品名未認識'}
          </p>
        ) : (
          <div className="barcode-heading text-center">
            <p className="mb-1 text-label-large font-semibold text-neutral-500">
              {format ? formatLabel(format) : 'JANバーコード'}
            </p>
            <h1 className="text-headline-small-emphasized break-words text-black">
              {item.name.trim() || '商品名未認識'}
            </h1>
            <p className="mt-1 inline-flex items-center gap-1 text-label-large font-semibold text-primary">
              <Icon name="verified" size={16} />
              確認済みの番号です
            </p>
          </div>
        )}

        <section
          className="barcode-sheet flex w-full max-w-4xl flex-col items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-2 sm:p-4"
          aria-label="JANバーコード"
        >
          <svg
            key={item.jan}
            ref={renderBarcode}
            className={`barcode-svg${renderError ? ' is-hidden' : ''}`}
            aria-label={`${format ?? 'JAN'} バーコード ${item.jan}`}
          />
          {renderError && (
            <p
              className="my-2 rounded-xl bg-[#fbeceb] px-3 py-2 text-body-medium font-semibold text-[#9b2c21]"
              role="alert"
            >
              {renderError}
            </p>
          )}
          <p
            className="barcode-number text-[clamp(1.3rem,6vw,2.875rem)] text-black"
            aria-label={`JAN ${item.jan}`}
          >
            {item.jan}
          </p>
          {format && (
            <p className="text-label-medium font-semibold tracking-wide text-neutral-500">
              {formatLabel(format)}
            </p>
          )}
        </section>

        {focusMode ? (
          <p className="focus-hint text-center text-body-small text-neutral-500">
            読み取れない場合は、上の番号をレジに手入力してください。
          </p>
        ) : (
          <>
            <div className="barcode-help w-full max-w-xl text-center text-body-small text-neutral-600">
              <p className="font-semibold text-neutral-800">
                レジのハンディスキャナーをバーコードに向けてください。
              </p>
              <ul className="mt-1 space-y-0.5">
                <li>画面の明るさを上げてください。</li>
                <li>横向きにすると大きく表示できます。</li>
                <li>
                  読み取れない場合は、表示中のJAN番号をレジに手入力してください。
                </li>
              </ul>
            </div>
            {wakeLockMessage && (
              <p
                className="wake-lock-note max-w-xl text-center text-label-small text-neutral-500"
                role="status"
              >
                {wakeLockMessage}
              </p>
            )}
          </>
        )}
      </div>

      <nav
        className="barcode-nav grid w-full grid-cols-[1fr_1.15fr_1fr] gap-2 px-1"
        aria-label="商品の切り替え"
      >
        <Button
          type="button"
          variant="outlined"
          className="h-12 min-w-0 border-neutral-300 px-2 text-neutral-800"
          disabled={!hasPrevious}
          onClick={onPrevious}
        >
          <Icon name="arrow_back" size={18} />
          前へ
        </Button>
        <Button
          type="button"
          variant="text"
          className="h-12 min-w-0 px-2 text-neutral-800"
          onClick={onClose}
        >
          <Icon name="list" size={18} />
          一覧に戻る
        </Button>
        <Button
          type="button"
          className="h-12 min-w-0 px-2"
          disabled={!hasNext}
          onClick={onNext}
        >
          次へ
          <Icon name="arrow_forward" size={18} />
        </Button>
      </nav>
    </main>
  );
}
