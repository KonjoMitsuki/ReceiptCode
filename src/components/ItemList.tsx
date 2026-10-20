import { useMemo } from 'react';
import {
  getDuplicateJanCounts,
  getScannableItems,
} from '../features/receipt/itemOperations';
import { validateJan } from '../lib/jan';
import type { ReceiptItem } from '../types/receipt';
import { ItemEditor } from './ItemEditor';
import { ManualAddForm } from './ManualAddForm';

interface ItemListProps {
  items: ReceiptItem[];
  manualAddOpen: boolean;
  hasPreparedImage: boolean;
  onUpdateItem: (
    id: string,
    patch: Partial<Pick<ReceiptItem, 'name' | 'jan'>>,
  ) => void;
  onDeleteItem: (id: string) => void;
  onToggleConfirm: (id: string) => void;
  onShowBarcode: (id: string) => void;
  onAddItem: (name: string, jan: string) => void;
  onManualAddOpenChange: (open: boolean) => void;
  onChooseAnother: () => void;
  onRetryOcr: () => void;
}

export function ItemList({
  items,
  manualAddOpen,
  hasPreparedImage,
  onUpdateItem,
  onDeleteItem,
  onToggleConfirm,
  onShowBarcode,
  onAddItem,
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
    <main className="screen review-screen">
      <header className="screen-header review-header">
        <div>
          <p className="eyebrow">ステップ 3 / 3</p>
          <h1>読み取り結果</h1>
          <p className="lead">
            商品ごとに商品名とJANを確認してください。確認済みの番号だけバーコードを表示できます。
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary button-compact"
          onClick={onChooseAnother}
        >
          別の画像
        </button>
      </header>

      <div className="notice notice-warning">
        <strong>OCRの結果です。スキャンの前に必ず確認してください。</strong>
        <span>
          チェックデジットが一致していても、別の商品の番号を読み取っている可能性があります。
        </span>
      </div>

      {items.length > 0 && (
        <div className="summary-row" aria-label="確認状況">
          <span className="summary-chip">{items.length}件</span>
          <span className="summary-chip summary-valid">
            有効 {validCount}
          </span>
          <span className="summary-chip summary-review">
            要確認 {reviewCount}
          </span>
          <span className="summary-chip summary-invalid">
            無効 {invalidCount}
          </span>
          <span className="summary-chip summary-confirmed">
            確認済み {confirmedCount}
          </span>
        </div>
      )}

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
            />
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="bulk-actions">
          <button
            type="button"
            className="button button-primary compact-primary"
            disabled={scannable.length === 0}
            onClick={() => onShowBarcode(scannable[0].id)}
          >
            確認済みのバーコードを表示（{scannable.length}件）
          </button>
          {scannable.length === 0 && (
            <p className="hint">
              各商品の「商品名とJANを確認しました」にチェックを入れると、まとめて表示できます。
            </p>
          )}
        </div>
      )}

      {manualAddOpen ? (
        <ManualAddForm
          onAdd={onAddItem}
          onCancel={() => onManualAddOpenChange(false)}
        />
      ) : (
        <button
          type="button"
          className="button button-secondary add-item-button"
          onClick={() => onManualAddOpenChange(true)}
        >
          ＋ 手入力で商品を追加
        </button>
      )}

      <p className="hint review-footer-hint">
        同じJANが複数ある場合も、別明細の可能性があるため自動では統合・削除しません。
      </p>
    </main>
  );
}
