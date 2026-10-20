import { validateJan } from '../lib/jan';
import type { ReceiptItem, ValidationState } from '../types/receipt';

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
      className={`item-card status-${status}`}
      aria-label={`${item.name || '商品名未認識'} ${item.jan}`}
    >
      <div className="item-card-top">
        <div className="badge-row">
          <span className={`badge badge-${status}`}>{statusText[status]}</span>
          {!item.name.trim() && (
            <span className="badge badge-neutral">商品名未認識</span>
          )}
          {item.confirmed && (
            <span className="badge badge-confirmed">確認済み</span>
          )}
        </div>
        <span className="meta-text">
          {item.source === 'ocr'
            ? `OCR行 ${item.sourceLine ?? '-'}`
            : '手入力'}
        </span>
        <button
          type="button"
          className="button button-danger-quiet item-delete"
          aria-label={`${item.name.trim() || '商品名未認識'}を削除`}
          onClick={handleDelete}
        >
          削除
        </button>
      </div>

      <div className="field">
        <label htmlFor={nameId}>商品名</label>
        <input
          id={nameId}
          type="text"
          value={item.name}
          placeholder="商品名未認識"
          autoComplete="off"
          onChange={(event) => onUpdate({ name: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor={janId}>JAN（8桁 / 13桁）</label>
        <input
          id={janId}
          className="jan-input"
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
        <span id={janHintId} className="field-hint">
          半角数字のみ。先頭の0もそのまま入力してください。
        </span>
      </div>

      <p className="status-detail">
        {status === 'invalid' ? (
          <span id={janErrorId}>{invalidDetail(item.jan)}</span>
        ) : status === 'needs-review' ? (
          'チェックデジットは有効です。商品名とJANの対応を確認してください。'
        ) : (
          'チェックデジットが一致しています（商品との一致は未確認です）。'
        )}
      </p>

      {(item.warnings.length > 0 || duplicateCount > 1) && (
        <ul className="warning-list">
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
      )}

      <label className="confirm-row">
        <input
          type="checkbox"
          checked={item.confirmed}
          disabled={!confirmable}
          aria-describedby={confirmable ? undefined : confirmHintId}
          onChange={onToggleConfirm}
        />
        <span>商品名とJANを確認しました</span>
      </label>
      {!confirmable && (
        <p id={confirmHintId} className="confirm-hint">
          JANを修正すると確認できます。
        </p>
      )}
    </li>
  );
}
