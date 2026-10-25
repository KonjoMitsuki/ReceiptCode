import type { PreparedImage } from '../lib/imageProcessing';

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
    <main tabIndex={-1} className="screen preview-screen">
      <header className="screen-header">
        <p className="eyebrow">ステップ 1 / 3</p>
        <h1>画像を確認</h1>
        <p className="lead">
          レシート全体が写り、文字がはっきり読めることを確認してください。
        </p>
      </header>

      <div className="preview-frame">
        <img
          src={image.previewUrl}
          alt="選択したレシート画像のプレビュー"
        />
      </div>

      <p className="image-meta">
        {image.width} × {image.height} px
      </p>

      {image.warnings.length > 0 && (
        <div className="notice notice-warning" role="status">
          {image.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <div className="stack-actions">
        <button
          type="button"
          className="button button-primary button-large"
          onClick={onStartOcr}
        >
          この画像で読み取る
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={onChooseAnother}
        >
          別の画像を選ぶ
        </button>
        <button
          type="button"
          className="button button-quiet"
          onClick={onManualStart}
        >
          JANを手入力する
        </button>
      </div>

      <p className="hint">
        読み取りには数秒〜十数秒かかる場合があります。初回はOCR用データの取得に時間がかかります。
      </p>
    </main>
  );
}
