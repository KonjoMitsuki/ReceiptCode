import { validateJan } from '../lib/jan';
import type { ReceiptItem, ValidationState } from '../types/receipt';
import { Badge } from './m3e/badge';
import { Button } from './m3e/button';
import { Checkbox } from './m3e/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from './m3e/field';
import { Icon } from './m3e/icon';
import { Input } from './m3e/input';

interface ItemEditorProps {
  item: ReceiptItem;
  duplicateCount: number;
  onUpdate: (patch: Partial<Pick<ReceiptItem, 'name' | 'jan'>>) => void;
  onDelete: () => void;
  onToggleConfirm: () => void;
}

function statusFor(item: ReceiptItem): ValidationState {
  if (!validateJan(item.jan).valid) return 'invalid';
  return item.validation === 'needs-review' ? 'needs-review' : 'valid';
}

function invalidDetail(jan: string): string {
  const result = validateJan(jan);
  switch (result.reason) {
    case 'invalid-characters':
      return '半角数字のみで入力してください。';
    case 'invalid-length':
      return '8桁または13桁で入力してください。';
    case 'invalid-check-digit':
      return `チェックデジットが一致しません。期待値は ${result.expectedCheckDigit} です。`;
    default:
      return 'JANの形式を確認してください。';
  }
}

const statusText: Record<ValidationState, string> = {
  valid: '有効',
  'needs-review': '要確認',
  invalid: '無効',
};

const statusBadgeClass: Record<ValidationState, string> = {
  valid:
    'border-transparent bg-primary-container text-on-primary-container',
  'needs-review':
    'border-transparent bg-tertiary-container text-on-tertiary-container',
  invalid: 'border-transparent bg-error-container text-on-error-container',
};

const statusStripeClass: Record<ValidationState, string> = {
  valid: 'before:bg-primary',
  'needs-review': 'before:bg-tertiary',
  invalid: 'before:bg-error',
};

export function ItemEditor({
  item,
  duplicateCount,
  onUpdate,
  onDelete,
  onToggleConfirm,
}: ItemEditorProps) {
  const liveValidation = validateJan(item.jan);
  const status = statusFor(item);
  const confirmable = liveValidation.valid;
  const nameId = `item-name-${item.id}`;
  const janId = `item-jan-${item.id}`;
  const janHintId = `item-jan-hint-${item.id}`;
  const janErrorId = `item-jan-error-${item.id}`;
  const confirmHintId = `item-confirm-hint-${item.id}`;

  const handleDelete = () => {
    if (window.confirm('この項目を削除しますか？')) onDelete();
  };

  return (
    <li
      className={`item-card relative overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-low p-4 shadow-elevation-1 before:absolute before:inset-y-0 before:left-0 before:w-1.5 ${statusStripeClass[status]}`}
      aria-label={`${item.name || '商品名未認識'} ${item.jan}`}
    >
      <div className="item-card-top mb-3 flex items-center gap-2 pl-1">
        <div className="badge-row flex flex-1 flex-wrap items-center gap-1.5">
          <Badge className={statusBadgeClass[status]}>
            {statusText[status]}
          </Badge>
          {!item.name.trim() && (
            <Badge variant="outline">商品名未認識</Badge>
          )}
          {item.confirmed && (
            <Badge className="border-transparent bg-primary text-on-primary">
              <Icon name="check" size={14} />
              確認済み
            </Badge>
          )}
        </div>
        <span className="meta-text whitespace-nowrap text-label-small text-on-surface-variant tabular-nums">
          {item.source === 'ocr'
            ? `OCR行 ${item.sourceLine ?? '-'}`
            : '手入力'}
        </span>
        <Button
          type="button"
          variant="text"
          size="icon-sm"
          className="item-delete size-11 text-on-surface-variant hover:text-error"
          aria-label={`${item.name.trim() || '商品名未認識'}を削除`}
          onClick={handleDelete}
        >
          <Icon name="delete" size={20} />
        </Button>
      </div>

      <div className="grid gap-3 pl-1">
        <Field>
          <FieldLabel htmlFor={nameId}>商品名</FieldLabel>
          <Input
            id={nameId}
            type="text"
            value={item.name}
            placeholder="商品名未認識"
            autoComplete="off"
            onChange={(event) => onUpdate({ name: event.target.value })}
          />
        </Field>

        <Field data-invalid={!liveValidation.valid}>
          <FieldLabel htmlFor={janId}>JAN（8桁 / 13桁）</FieldLabel>
          <Input
            id={janId}
            className="jan-input font-mono text-title-large tracking-wider"
            type="text"
            value={item.jan}
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={13}
            pattern="[0-9]*"
            aria-describedby={
              liveValidation.valid ? janHintId : `${janHintId} ${janErrorId}`
            }
            aria-invalid={!liveValidation.valid}
            onChange={(event) => onUpdate({ jan: event.target.value })}
          />
          <FieldDescription id={janHintId}>
            半角数字のみ。先頭の0もそのまま入力してください。
          </FieldDescription>
        </Field>

        {status === 'invalid' ? (
          <FieldError id={janErrorId}>
            {invalidDetail(item.jan)}
          </FieldError>
        ) : (
          <p className="status-detail flex items-start gap-1.5 text-body-small text-on-surface-variant">
            <Icon
              name={status === 'needs-review' ? 'help' : 'check_circle'}
              size={16}
              className="mt-0.5 shrink-0"
            />
            {status === 'needs-review'
              ? 'チェックデジットは有効です。商品名とJANの対応を確認してください。'
              : 'チェックデジットが一致しています（商品との一致は未確認です）。'}
          </p>
        )}

        {(item.warnings.length > 0 || duplicateCount > 1) && (
          <div className="rounded-xl bg-tertiary-container px-3 py-2.5 text-body-small text-on-tertiary-container">
            <ul className="list-disc space-y-1 pl-4">
              {item.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
              {duplicateCount > 1 && (
                <li>
                  同じJANが他に{duplicateCount - 1}
                  件あります。自動での統合・削除は行っていません。
                </li>
              )}
            </ul>
          </div>
        )}

        <label className="confirm-row flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-3 py-2.5 text-body-large text-on-surface transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary-container/45 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
          <Checkbox
            aria-label="商品名とJANを確認しました"
            checked={item.confirmed}
            disabled={!confirmable}
            aria-describedby={confirmable ? undefined : confirmHintId}
            onCheckedChange={onToggleConfirm}
          />
          <span className="text-body-large-emphasized">
            商品名とJANを確認しました
          </span>
        </label>
        {!confirmable && (
          <p
            id={confirmHintId}
            className="confirm-hint -mt-1 text-body-small text-error"
          >
            JANを修正すると確認できます。
          </p>
        )}
      </div>
    </li>
  );
}
