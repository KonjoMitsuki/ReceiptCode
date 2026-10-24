interface ReceiptUploaderProps {
  onFileSelected: (file: File) => void;
}

export function ReceiptUploader({ onFileSelected }: ReceiptUploaderProps) {
  return (
    <main className="screen upload-screen" tabIndex={-1}>
      <section className="hero">
        <h1>レシートを読み取る</h1>
        <p>画像から商品JANコードを抽出します</p>
        <p className="privacy-caption">端末内で処理・プライバシーを保護</p>
      </section>
      <section className="upload-card" aria-labelledby="upload-heading">
        <span className="upload-icon" aria-hidden="true">▣</span>
        <h2 id="upload-heading">レシート写真を追加</h2>
        <p>カメラで撮影、または画像を選択</p>
        <input
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
        <label htmlFor="receipt-image-input" className="button button-primary upload-button">
          ＋ 画像を選択
        </label>
      </section>
      <p className="upload-hint">ヒント：JANがはっきり写るように撮影</p>
    </main>
  );
}
