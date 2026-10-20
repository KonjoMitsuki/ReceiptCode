import { useId, useState, type FormEvent } from 'react';
import { validateJan } from '../lib/jan';

interface ManualAddFormProps {
  onAdd: (name: string, jan: string) => void;
  onCancel: () => void;
}

export function ManualAddForm({ onAdd, onCancel }: ManualAddFormProps) {
  const [name, setName] = useState('');
  const [jan, setJan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const nameId = `${formId}-name`;
  const janId = `${formId}-jan`;
  const hintId = `${formId}-hint`;
  const errorId = `${formId}-error`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedJan = jan.trim();

    if (!/^\d{8}$|^\d{13}$/.test(trimmedJan)) {
      setError('JANは半角数字8桁または13桁で入力してください。');
      return;
    }

    const validation = validateJan(trimmedJan);
    if (!validation.valid) {
      setError(
        validation.reason === 'invalid-check-digit'
          ? `チェックデジットが一致しません。期待値は ${validation.expectedCheckDigit} です。`
          : 'JANの形式を確認してください。',
      );
      return;
    }

    setError(null);
    onAdd(name, trimmedJan);
  };

  return (
    <form
      className="manual-form"
      aria-labelledby={`${formId}-title`}
      onSubmit={handleSubmit}
      noValidate
    >
      <h2 id={`${formId}-title`} className="section-title">
        JANを手入力で追加
      </h2>
      <p className="hint">
        商品名は任意です。JANは先頭の0を省略せず、全桁を入力してください。
      </p>

      <div className="field">
        <label htmlFor={nameId}>商品名（任意）</label>
        <input
          id={nameId}
          type="text"
          value={name}
          autoComplete="off"
          placeholder="例: 牛乳 1L"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={janId}>JAN（8桁 / 13桁）</label>
        <input
          id={janId}
          className="jan-input"
          type="text"
          value={jan}
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={13}
          pattern="[0-9]*"
          placeholder="例: 4901234567894"
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setJan(event.target.value);
            if (error) setError(null);
          }}
        />
        <span id={hintId} className="field-hint">
          半角数字のみ・チェックデジットも含めて入力
        </span>
      </div>

      {error && (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button button-primary">
          一覧に追加
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
        >
          閉じる
        </button>
      </div>
    </form>
  );
}
