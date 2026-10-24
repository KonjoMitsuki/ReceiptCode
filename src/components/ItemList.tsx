import { useMemo } from 'react';
import { getDuplicateJanCounts } from '../features/receipt/itemOperations';
import type { ReceiptItem } from '../types/receipt';
import { ItemEditor } from './ItemEditor';

interface ItemListProps {
  items: ReceiptItem[];
  onUpdateItem: (id: string, patch: Partial<Pick<ReceiptItem, 'name' | 'jan'>>) => void;
  onDeleteItem: (id: string) => void;
  onToggleConfirm: (id: string) => void;
  onShowBarcode: (id: string) => void;
  onManualAddOpenChange: (open: boolean) => void;
}

export function ItemList({ items, onUpdateItem, onDeleteItem, onToggleConfirm, onShowBarcode, onManualAddOpenChange }: ItemListProps) {
  const duplicateCounts = useMemo(() => getDuplicateJanCounts(items), [items]);
  return (
    <main className="screen review-screen" tabIndex={-1}>
      <header className="review-header">
        <h1>読み取りが完了しました</h1>
        <div className="success-banner" role="status">✓  {items.length}件のJANコードを検出</div>
      </header>
      <div className="results-heading">
        <h2>検出した商品</h2>
        <p>内容を確認・編集できます</p>
      </div>
      {items.length ? (
        <ul className="item-list">
          {items.map(item => (
            <ItemEditor key={item.id} item={item} duplicateCount={duplicateCounts.get(item.jan) ?? 1}
              onUpdate={patch => onUpdateItem(item.id, patch)}
              onDelete={() => onDeleteItem(item.id)} onToggleConfirm={() => onToggleConfirm(item.id)}
              onShowBarcode={() => onShowBarcode(item.id)} />
          ))}
        </ul>
      ) : (
        <section className="empty-card">
          <h2>JAN候補を検出できませんでした</h2>
          <p>手動追加からJANを入力するか、⋮メニューから画像を読み取り直してください。</p>
        </section>
      )}
      <button type="button" className="button button-secondary add-item-button" onClick={() => onManualAddOpenChange(true)}>
        ＋ 商品を手動追加
      </button>
    </main>
  );
}
