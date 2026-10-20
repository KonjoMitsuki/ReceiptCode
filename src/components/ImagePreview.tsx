import type { PreparedImage } from '../lib/imageProcessing';
import { Alert, AlertDescription, AlertTitle } from './m3e/alert';
import { Button } from './m3e/button';
import { Card, CardContent, CardFooter } from './m3e/card';
import { Icon } from './m3e/icon';

interface ImagePreviewProps {
  image: PreparedImage;
  onStartOcr: () => void;
  onChooseAnother: () => void;
  onManualStart: () => void;
}

export function ImagePreview({
  image,
  onStartOcr,
  onChooseAnother,
  onManualStart,
}: ImagePreviewProps) {
  return (
    <main className="screen preview-screen mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-5 pb-8 sm:px-6 sm:pt-8">
      <header className="screen-header">
        <p className="text-label-large font-semibold text-primary">
          ステップ 1 / 3
        </p>
        <h1 className="mt-1 text-headline-medium-emphasized sm:text-headline-large-emphasized">
          画像を確認
        </h1>
        <p className="lead mt-2 max-w-xl text-body-large text-on-surface-variant">
          レシート全体が写り、文字がはっきり読めることを確認してください。
        </p>
      </header>

      <Card variant="outlined" className="overflow-hidden bg-surface-container-low">
        <CardContent className="p-3 sm:p-4">
          <div className="flex max-h-[44vh] items-center justify-center overflow-hidden rounded-2xl bg-surface-container-highest sm:max-h-[50vh]">
            <img
              src={image.previewUrl}
              alt="選択したレシート画像のプレビュー"
              className="block h-auto max-h-[44vh] w-auto max-w-full rounded-2xl object-contain sm:max-h-[50vh]"
            />
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-3 text-body-small text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="image" size={16} />
            {image.width} × {image.height} px
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="lock" size={16} />
            端末内で処理
          </span>
        </CardFooter>
      </Card>

      {image.warnings.length > 0 && (
        <Alert variant="tertiary" role="status">
          <Icon name="warning" size={20} />
          <AlertTitle>画像の確認ポイント</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {image.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="stack-actions grid gap-2 sm:grid-cols-[1.4fr_1fr]">
        <Button size="md" onClick={onStartOcr} className="w-full">
          <Icon name="document_scanner" size={22} />
          この画像で読み取る
        </Button>
        <Button
          variant="outlined"
          size="md"
          onClick={onChooseAnother}
          className="w-full"
        >
          <Icon name="photo_library" size={20} />
          別の画像を選ぶ
        </Button>
        <Button
          variant="text"
          size="md"
          onClick={onManualStart}
          className="w-full justify-center sm:col-start-1 sm:justify-start"
        >
          <Icon name="keyboard" size={20} />
          JANを手入力する
        </Button>
      </div>

      <p className="hint flex items-start gap-2 text-body-small text-on-surface-variant">
        <Icon name="schedule" size={16} className="mt-0.5 shrink-0" />
        読み取りには数秒〜十数秒かかる場合があります。初回はOCR用データの取得に時間がかかります。
      </p>
    </main>
  );
}
