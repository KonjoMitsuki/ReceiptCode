import { useMemo } from 'react';
import {
  getDuplicateJanCounts,
  getScannableItems,
} from '../features/receipt/itemOperations';
import { validateJan } from '../lib/jan';
import type { ReceiptItem } from '../types/receipt';
import { ItemEditor } from './ItemEditor';

interface ItemListProps {
  items: ReceiptItem[];
  hasPreparedImage: boolean;
  onUpdateItem: (
    id: string,
    patch: Partial<Pick<ReceiptItem, 'name' | 'jan'>>,
  ) => void;
  onDeleteItem: (id: string) => void;
  onToggleConfirm: (id: string) => void;
  onShowBarcode: (id: string) => void;
  onManualAddOpenChange: (open: boolean) => void;
  onChooseAnother: () => void;
  onRetryOcr: () => void;
}

export function ItemList({
  items,
  hasPreparedImage,
  onUpdateItem,
  onDeleteItem,
  onToggleConfirm,
  onShowBarcode,
  onManualAddOpenChange,
  onChooseAnother,
  onRetryOcr,
}: ItemListProps) {
  const duplicateCounts = useMemo(
    () => getDuplicateJanCounts(items),
    [items],
  );
  const scannable = useMemo(() => getScannableItems(items), [items]);

  const validCount = items.filter(
    (item) => validateJan(item.jan).valid && item.validation === 'valid',
  ).length;
  const reviewCount = items.filter(
    (item) =>
      validateJan(item.jan).valid && item.validation === 'needs-review',
  ).length;
  const invalidCount = items.filter(
    (item) => !validateJan(item.jan).valid,
  ).length;
  const confirmedCount = items.filter((item) => item.confirmed).length;

  return (
    <main className="screen review-screen" tabIndex={-1}>
      <header className="review-header">
        <h1>読み取りが完了しました</h1>
        <div className="success-banner" role="status">✓ {items.length}件のJANコードを検出</div>
      </header>
      <div className="results-heading">
        <h2>検出した商品</h2>
        <p>内容を確認・編集できます</p>
      </div>

      {items.length === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            0
          </span>
          <h2>JAN候補を検出できませんでした</h2>
          <p>
            レシートの写り方や印字によっては読み取れないことがあります。JANを手入力するか、画像を撮り直してください。
          </p>
          <div className="stack-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => onManualAddOpenChange(true)}
            >
              JANを手入力で追加
            </button>
            {hasPreparedImage && (
              <button
                type="button"
                className="button button-secondary"
                onClick={onRetryOcr}
              >
                同じ画像でもう一度読み取る
              </button>
            )}
            <button
              type="button"
              className="button button-secondary"
              onClick={onChooseAnother}
            >
              別の画像を選ぶ
            </button>
          </div>
        </section>
      ) : (
        <ul className="item-list">
          {items.map((item) => (
            <ItemEditor
              key={item.id}
              item={item}
              duplicateCount={duplicateCounts.get(item.jan) ?? 1}
              onUpdate={(patch) => onUpdateItem(item.id, patch)}
              onDelete={() => onDeleteItem(item.id)}
              onToggleConfirm={() => onToggleConfirm(item.id)}
              onShowBarcode={() => onShowBarcode(item.id)}
            />
          ))}
        </ul>
      )}

      <button type="button" className="button button-secondary add-item-button"
        onClick={() => onManualAddOpenChange(true)}>
        ＋ 商品を手動追加
      </button>

      {items.length > 0 && (
        <div className="bulk-actions">
          <button type="button" className="button button-primary compact-primary"
            disabled={scannable.length === 0} onClick={() => onShowBarcode(scannable[0].id)}>
            確認済みのバーコードを表示（{scannable.length}件）
          </button>
          <p className="hint">商品名とJANを確認した商品だけバーコードを表示できます。</p>
        </div>
      )}
      <details className="review-details">
        <summary>確認状況・読み取りの操作</summary>
        <div className="summary-row" aria-label="確認状況">
          <span>有効 {validCount}</span><span>要確認 {reviewCount}</span>
          <span>無効 {invalidCount}</span><span>確認済み {confirmedCount}</span>
        </div>
        <p className="hint">チェックデジットが一致していても、商品との一致は確認が必要です。</p>
        <div className="stack-actions">
          {hasPreparedImage && <button type="button" className="button button-secondary" onClick={onRetryOcr}>同じ画像でもう一度読み取る</button>}
          <button type="button" className="button button-quiet" onClick={onChooseAnother}>別の画像を選ぶ</button>
        </div>
      </details>

      <p className="hint review-footer-hint">
        同じJANが複数ある場合も、別明細の可能性があるため自動では統合・削除しません。
      </p>
    </main>
  );
}
