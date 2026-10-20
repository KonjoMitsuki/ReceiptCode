import { useMemo } from 'react';
import {
  getDuplicateJanCounts,
  getScannableItems,
} from '../features/receipt/itemOperations';
import { validateJan } from '../lib/jan';
import type { ReceiptItem } from '../types/receipt';
import { Alert, AlertDescription, AlertTitle } from './m3e/alert';
import { Badge } from './m3e/badge';
import { Button } from './m3e/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './m3e/empty';
import { Icon } from './m3e/icon';
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
    <main className="screen review-screen mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-5 pb-8 sm:px-6 sm:pt-8">
      <header className="screen-header review-header flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-label-large font-semibold text-primary">
            ステップ 3 / 3
          </p>
          <h1 className="mt-1 text-headline-medium-emphasized sm:text-headline-large-emphasized">
            読み取り結果
          </h1>
          <p className="lead mt-2 max-w-xl text-body-large text-on-surface-variant">
            商品ごとに商品名とJANを確認してください。確認済みの番号だけバーコードを表示できます。
          </p>
        </div>
        <Button
          type="button"
          variant="outlined"
          size="sm"
          onClick={onChooseAnother}
          className="shrink-0"
        >
          <Icon name="photo_library" size={18} />
          別の画像
        </Button>
      </header>

      <Alert variant="tertiary" role="note">
        <Icon name="warning" size={20} />
        <AlertTitle>OCRの結果です。スキャンの前に必ず確認してください。</AlertTitle>
        <AlertDescription>
          チェックデジットが一致していても、別の商品の番号を読み取っている可能性があります。
        </AlertDescription>
      </Alert>

      {items.length > 0 && (
        <div
          className="summary-row flex flex-wrap items-center gap-1.5"
          aria-label="確認状況"
        >
          <Badge variant="outline" className="bg-surface-container">
            {items.length}件
          </Badge>
          <Badge className="border-transparent bg-primary-container text-on-primary-container">
            有効 {validCount}
          </Badge>
          <Badge className="border-transparent bg-tertiary-container text-on-tertiary-container">
            要確認 {reviewCount}
          </Badge>
          <Badge className="border-transparent bg-error-container text-on-error-container">
            無効 {invalidCount}
          </Badge>
          <Badge variant="outline" className="border-primary/35 text-primary">
            <Icon name="check" size={14} />
            確認済み {confirmedCount}
          </Badge>
        </div>
      )}

      {items.length === 0 ? (
        <Empty className="rounded-3xl border-outline-variant bg-surface-container-low py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-14 rounded-full">
              <Icon name="search_off" size={28} />
            </EmptyMedia>
            <EmptyTitle>
              <h2 className="text-headline-small-emphasized">
                JAN候補を検出できませんでした
              </h2>
            </EmptyTitle>
            <EmptyDescription>
              レシートの写り方や印字によっては読み取れないことがあります。JANを手入力するか、画像を撮り直してください。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              size="md"
              className="w-full"
              onClick={() => onManualAddOpenChange(true)}
            >
              <Icon name="keyboard" size={20} />
              JANを手入力で追加
            </Button>
            {hasPreparedImage && (
              <Button
                type="button"
                variant="outlined"
                size="md"
                className="h-auto min-h-14 w-full whitespace-normal px-4 py-2.5 text-center"
                onClick={onRetryOcr}
              >
                <Icon name="refresh" size={20} />
                同じ画像でもう一度読み取る
              </Button>
            )}
            <Button
              type="button"
              variant="text"
              size="md"
              className="w-full"
              onClick={onChooseAnother}
            >
              <Icon name="photo_library" size={20} />
              別の画像を選ぶ
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="item-list grid gap-3">
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
        <div className="bulk-actions rounded-2xl border border-outline-variant bg-surface-container-high p-3 shadow-elevation-1">
          <Button
            type="button"
            size="md"
            className="compact-primary h-auto min-h-14 w-full whitespace-normal px-4 py-2.5 text-center"
            disabled={scannable.length === 0}
            onClick={() => onShowBarcode(scannable[0].id)}
          >
            <Icon name="barcode" size={22} />
            確認済みのバーコードを表示（{scannable.length}件）
          </Button>
          {scannable.length === 0 && (
            <p className="hint mt-2 text-center text-body-small text-on-surface-variant">
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
        <Button
          type="button"
          variant="outlined"
          size="md"
          className="add-item-button w-full"
          onClick={() => onManualAddOpenChange(true)}
        >
          ＋ 手入力で商品を追加
        </Button>
      )}

      <p className="hint review-footer-hint text-body-small text-on-surface-variant">
        同じJANが複数ある場合も、別明細の可能性があるため自動では統合・削除しません。
      </p>
    </main>
  );
}
