import type { FlowError } from '../features/receipt/useReceiptFlow';
import { Alert, AlertDescription, AlertTitle } from './m3e/alert';
import { Button } from './m3e/button';
import { Card, CardContent } from './m3e/card';
import { Icon } from './m3e/icon';

interface ErrorPanelProps {
  error: FlowError;
  onRetry: () => void;
  onChooseAnother: () => void;
  onManualStart: () => void;
}

export function ErrorPanel({
  error,
  onRetry,
  onChooseAnother,
  onManualStart,
}: ErrorPanelProps) {
  return (
    <main className="screen error-screen mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-5 pb-8 sm:px-6 sm:pt-8">
      <Card variant="outlined" className="overflow-hidden">
        <CardContent className="p-0">
          <Alert variant="destructive" className="rounded-none p-5 sm:p-6">
            <Icon name="error" size={24} />
            <AlertTitle>
              <h1 className="text-headline-small-emphasized">{error.title}</h1>
            </AlertTitle>
            <AlertDescription className="mt-1">
              {error.message}
            </AlertDescription>
            {error.kind === 'model-load' && (
              <p className="mt-3 text-body-small text-on-error-container/85">
                初回はOCR用の日本語・英数字データ（数MB〜十数MB）を取得するため、通信環境が必要です。
              </p>
            )}
          </Alert>
        </CardContent>
      </Card>

      <div className="stack-actions grid gap-2">
        {error.canRetry && (
          <Button size="md" className="w-full" onClick={onRetry}>
            <Icon name="refresh" size={20} />
            もう一度読み取る
          </Button>
        )}
        <Button
          variant="outlined"
          size="md"
          className="w-full"
          onClick={onChooseAnother}
        >
          <Icon name="photo_library" size={20} />
          別の画像を選ぶ
        </Button>
        <Button
          variant="text"
          size="md"
          className="w-full justify-center"
          onClick={onManualStart}
        >
          <Icon name="keyboard" size={20} />
          JANを手入力する
        </Button>
      </div>

      <p className="hint text-body-small text-on-surface-variant">
        OCRで候補が見つからない場合も、手入力でバーコード表示まで進められます。
      </p>
    </main>
  );
}
