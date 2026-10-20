import type { PreparedImage } from '../lib/imageProcessing';
import type { OcrProgress as OcrProgressState } from '../lib/ocr';

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

const stageLabels = ['準備', '認識', '整理'];

export function OcrProgress({
  image,
  progress,
  onCancel,
}: OcrProgressProps) {
  const percent = Math.round(progress.ratio * 100);
  const activeStage = stageOrder[progress.stage];

  return (
    <main className="screen processing-screen">
      <header className="screen-header">
        <p className="eyebrow">ステップ 2 / 3</p>
        <h1>レシートを読み取っています</h1>
        <p className="lead">
          画面を閉じずにお待ちください。処理はこの端末内で行われています。
        </p>
      </header>

      <div className="processing-card">
        <div className="processing-thumb">
          <img src={image.previewUrl} alt="" />
        </div>
        <div className="processing-status">
          <ol className="progress-steps" aria-label="OCRの進行状況">
            {stageLabels.map((label, index) => (
              <li
                key={label}
                className={
                  index < activeStage
                    ? 'is-complete'
                    : index === activeStage
                      ? 'is-active'
                      : ''
                }
                aria-current={index === activeStage ? 'step' : undefined}
              >
                {label}
              </li>
            ))}
          </ol>

          <p className="progress-message" aria-live="polite">
            {progress.message}
          </p>

          <div
            className="progress-track"
            role="progressbar"
            aria-label="OCRの進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent}%`}
          >
            <span
              className="progress-fill"
              style={{ width: `${Math.max(3, percent)}%` }}
            />
          </div>
          <p className="progress-percent">{percent}%</p>
        </div>
      </div>

      <div className="privacy-note">
        <strong>画像は送信されません。</strong>
        <span>OCR用のプログラムと言語データは初回のみ取得します。</span>
      </div>

      <button
        type="button"
        className="button button-secondary"
        onClick={onCancel}
      >
        読み取りを中止して画像確認に戻る
      </button>
    </main>
  );
}
