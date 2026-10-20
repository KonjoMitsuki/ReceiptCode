import type { PreparedImage } from '../lib/imageProcessing';
import type { OcrProgress as OcrProgressState } from '../lib/ocr';
import { Alert, AlertDescription, AlertTitle } from './m3e/alert';
import { Button } from './m3e/button';
import { Card, CardContent } from './m3e/card';
import { Icon } from './m3e/icon';
import { Progress } from './m3e/progress';
import { Spinner } from './m3e/spinner';

interface OcrProgressProps {
  image: PreparedImage;
  progress: OcrProgressState;
  onCancel: () => void;
}

const stageOrder: Record<OcrProgressState['stage'], number> = {
  loading: 0,
  recognizing: 1,
  parsing: 2,
};

const stageLabels = [
  { label: '準備', icon: 'downloading' },
  { label: '認識', icon: 'document_scanner' },
  { label: '整理', icon: 'fact_check' },
] as const;

export function OcrProgress({
  image,
  progress,
  onCancel,
}: OcrProgressProps) {
  const percent = Math.round(progress.ratio * 100);
  const activeStage = stageOrder[progress.stage];

  return (
    <main className="screen processing-screen mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-5 pb-8 sm:px-6 sm:pt-8">
      <header className="screen-header">
        <p className="text-label-large font-semibold text-primary">
          ステップ 2 / 3
        </p>
        <h1 className="mt-1 text-headline-medium-emphasized sm:text-headline-large-emphasized">
          レシートを読み取っています
        </h1>
        <p className="lead mt-2 max-w-xl text-body-large text-on-surface-variant">
          画面を閉じずにお待ちください。処理はこの端末内で行われています。
        </p>
      </header>

      <Card variant="elevated" className="bg-surface-container-low">
        <CardContent className="grid gap-5 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:p-5">
          <div className="relative h-40 overflow-hidden rounded-2xl bg-surface-container-highest sm:h-44">
            <img
              src={image.previewUrl}
              alt=""
              className="size-full object-cover"
            />
            <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgb(0_0_0/0.45))]" />
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-label-small font-semibold text-black shadow-elevation-1">
              <Spinner className="size-3.5 text-primary" />
              読み取り中
            </span>
          </div>

          <div className="processing-status min-w-0">
            <ol
              className="mb-4 flex gap-2"
              aria-label="OCRの進行状況"
            >
              {stageLabels.map((stage, index) => (
                <li
                  key={stage.label}
                  aria-current={index === activeStage ? 'step' : undefined}
                  className={
                    index < activeStage
                      ? 'flex flex-1 items-center justify-center gap-1 rounded-full bg-primary-container px-2 py-1.5 text-label-small font-semibold text-on-primary-container'
                      : index === activeStage
                        ? 'flex flex-1 items-center justify-center gap-1 rounded-full bg-primary px-2 py-1.5 text-label-small font-semibold text-on-primary'
                        : 'flex flex-1 items-center justify-center gap-1 rounded-full bg-surface-container-highest px-2 py-1.5 text-label-small font-semibold text-on-surface-variant'
                  }
                >
                  <Icon name={stage.icon} size={14} />
                  {stage.label}
                </li>
              ))}
            </ol>

            <p
              className="progress-message min-h-10 text-title-medium text-on-surface"
              aria-live="polite"
            >
              {progress.message}
            </p>

            <Progress
              value={percent}
              max={100}
              variant="wavy"
              aria-label="OCRの進捗"
              className="mt-2"
            />
            <p className="mt-2 text-right text-label-large font-semibold text-on-surface-variant tabular-nums">
              {percent}%
            </p>
          </div>
        </CardContent>
      </Card>

      <Alert variant="info">
        <Icon name="lock" size={20} />
        <AlertTitle>画像は送信されません。</AlertTitle>
        <AlertDescription>
          OCR用のプログラムと言語データは初回のみ取得します。
        </AlertDescription>
      </Alert>

      <Button
        variant="outlined"
        size="md"
        onClick={onCancel}
        className="w-full sm:w-auto"
      >
        <Icon name="close" size={20} />
        読み取りを中止して画像確認に戻る
      </Button>
    </main>
  );
}
