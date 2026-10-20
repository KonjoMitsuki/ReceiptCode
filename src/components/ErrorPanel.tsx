import type { FlowError } from '../features/receipt/useReceiptFlow';

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
    <main className="screen error-screen">
      <div className="error-card" role="alert">
        <span className="error-mark" aria-hidden="true">
          !
        </span>
        <h1>{error.title}</h1>
        <p>{error.message}</p>
        {error.kind === 'model-load' && (
          <p className="hint">
            初回はOCR用の日本語・英数字データ（数MB〜十数MB）を取得するため、通信環境が必要です。
          </p>
        )}
      </div>

      <div className="stack-actions">
        {error.canRetry && (
          <button
            type="button"
            className="button button-primary button-large"
            onClick={onRetry}
          >
            もう一度読み取る
          </button>
        )}
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
        OCRで候補が見つからない場合も、手入力でバーコード表示まで進められます。
      </p>
    </main>
  );
}
