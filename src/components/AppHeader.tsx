interface AppHeaderProps {
  onBack?: () => void;
}

export function AppHeader({ onBack }: AppHeaderProps) {
  return (
    <header className="app-header">
      {onBack ? (
        <button type="button" className="button button-quiet back-link" onClick={onBack}>
          ‹ 商品一覧
        </button>
      ) : (
        <>
          <span className="brand-name">ReceiptCode</span>
          <details className="app-menu">
            <summary aria-label="アプリについて">⋮</summary>
            <div className="menu-content">
              <strong>ReceiptCode / Receipt2JAN</strong>
              <p>写真・OCR結果は端末内で処理します。初回のみOCR用データを取得します。</p>
              <p>再読み込みすると結果は失われます。</p>
            </div>
          </details>
        </>
      )}
    </header>
  );
}
