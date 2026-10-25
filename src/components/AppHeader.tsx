import type { ReactNode } from 'react';

interface AppHeaderProps {
  onBack?: () => void;
  children?: ReactNode;
}

export function AppHeader({ onBack, children }: AppHeaderProps) {
  return (
    <>
      <header className="app-header">
        {onBack ? (
          <button type="button" className="button button-quiet back-link" onClick={onBack}>‹ 商品一覧</button>
        ) : (
          <>
            <span className="brand-name">ReceiptCode</span>
            <details className="app-menu">
              <summary aria-label="その他の操作">⋮</summary>
              <div className="menu-content" onClick={event => {
                if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }
              }}>
                {children}
                <p>写真・OCR結果は端末内で処理します。初回のみOCR用データを取得します。</p>
                <p>再読み込みすると結果は失われます。</p>
              </div>
            </details>
          </>
        )}
      </header>
    </>
  );
}
