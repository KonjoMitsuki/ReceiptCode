import { useRef } from 'react';

interface ReceiptUploaderProps {
  onFileSelected: (file: File) => void;
  onManualStart: () => void;
}

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  );
}

export function ReceiptUploader({
  onFileSelected,
  onManualStart,
}: ReceiptUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <main className="screen upload-screen">
      <section className="hero">
        <p className="eyebrow">店舗スタッフ向け・端末内処理</p>
        <h1>
          レシートから
          <br />
          JANを読み取る
        </h1>
        <p className="lead">
          印字された商品名とJANを読み取り、レジのスキャナーで使えるバーコードを表示します。
        </p>
      </section>

      <section className="upload-card" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="section-title">
          レシート画像
        </h2>
        <input
          ref={inputRef}
          id="receipt-image-input"
          className="visually-hidden"
          type="file"
          accept="image/*"
          aria-label="レシート画像を選択"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) onFileSelected(file);
          }}
        />
        <label
          htmlFor="receipt-image-input"
          className="button button-primary button-large upload-button"
        >
          <CameraIcon />
          レシートを撮影 / 画像を選択
        </label>
        <p className="hint">
          スマートフォンのカメラまたは写真ライブラリから選べます。JPEG /
          PNG / WebP推奨。
        </p>
        <button
          type="button"
          className="button button-quiet manual-start-button"
          onClick={onManualStart}
        >
          JANを手入力して始める
        </button>
      </section>

      <ol className="flow-steps" aria-label="利用手順">
        <li>
          <span className="step-number">1</span>
          <span>撮影・選択</span>
        </li>
        <li>
          <span className="step-number">2</span>
          <span>商品とJANを確認</span>
        </li>
        <li>
          <span className="step-number">3</span>
          <span>バーコードを表示</span>
        </li>
      </ol>

      <aside className="privacy-note">
        <strong>写真は外部に送信しません。</strong>
        <span>
          OCRは端末のブラウザ内で実行します。初回のみOCR用データの取得に通信します。
        </span>
      </aside>
    </main>
  );
}
