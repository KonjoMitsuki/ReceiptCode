import { useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from './m3e/alert';
import { buttonVariants } from './m3e/button';
import { Card } from './m3e/card';
import { Icon } from './m3e/icon';

interface ReceiptUploaderProps {
  onFileSelected: (file: File) => void;
  onManualStart: () => void;
}

const steps = [
  { icon: 'photo_camera', label: '撮影・選択' },
  { icon: 'fact_check', label: '商品とJANを確認' },
  { icon: 'barcode', label: 'バーコードを表示' },
] as const;

export function ReceiptUploader({
  onFileSelected,
  onManualStart,
}: ReceiptUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <main className="screen upload-screen mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-4 pb-8 sm:px-6 sm:pt-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-primary-container px-5 py-7 text-on-primary-container sm:px-9 sm:py-11">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-12 size-52 rounded-full bg-primary/10"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-4 -bottom-20 size-36 rounded-full border-[18px] border-primary/10"
        />
        <div className="relative">
          <p className="text-label-large font-semibold tracking-wide text-on-primary-container/80">
            端末内処理
          </p>
          <h1 className="mt-3 max-w-xl text-headline-large-emphasized sm:text-display-small-emphasized md:text-display-medium-emphasized">
            レシートから
            <br />
            JANを読み取る
          </h1>
          <p className="mt-4 max-w-lg text-body-large text-on-primary-container/85">
            印字された商品名とJANを読み取り、レジのスキャナーで使えるバーコードを表示します。
          </p>

          <input
            ref={inputRef}
            id="receipt-image-input"
            className="sr-only"
            type="file"
            accept="image/*"
            aria-label="レシート画像を選択"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) onFileSelected(file);
            }}
          />
          <div className="mt-7 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="receipt-image-input"
              className={buttonVariants({
                variant: 'filled',
                size: 'md',
                className:
                  'upload-button w-full justify-center shadow-elevation-1 sm:w-auto',
              })}
            >
              <Icon name="photo_camera" size={22} />
              レシートを撮影 / 画像を選択
            </label>
            <button
              type="button"
              className={buttonVariants({
                variant: 'text',
                size: 'md',
                className:
                  'manual-start-button justify-center text-on-primary-container sm:w-auto',
              })}
              onClick={onManualStart}
            >
              <Icon name="keyboard" size={20} />
              JANを手入力して始める
            </button>
          </div>
          <p className="mt-3 max-w-md text-body-small text-on-primary-container/75">
            スマートフォンのカメラまたは写真ライブラリから選べます。JPEG /
            PNG / WebP推奨。
          </p>
        </div>
      </section>

      <ol
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        aria-label="利用手順"
      >
        {steps.map((step, index) => (
          <li key={step.label}>
            <Card
              variant="filled"
              size="sm"
              className="h-full flex-row items-center gap-3 px-4 py-3 sm:flex-col sm:items-start sm:gap-4 sm:px-4 sm:py-4"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-primary shadow-elevation-1">
                <Icon name={step.icon} size={20} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-label-small font-semibold tracking-wide text-on-surface-variant">
                  STEP {index + 1}
                </span>
                <span className="text-title-small text-on-surface">
                  {step.label}
                </span>
              </span>
            </Card>
          </li>
        ))}
      </ol>

      <Alert variant="info">
        <Icon name="lock" size={20} />
        <AlertTitle>写真は外部に送信しません。</AlertTitle>
        <AlertDescription>
          OCRは端末のブラウザ内で実行します。初回のみOCR用データの取得に通信します。
        </AlertDescription>
      </Alert>
    </main>
  );
}
