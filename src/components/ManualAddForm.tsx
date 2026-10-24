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
      <header className="manual-heading">
        <h1 id={`${formId}-title`}>商品を追加</h1>
        <p>JANコードを入力して追加します</p>
      </header>

      <div className="field">
        <label htmlFor={nameId}>商品名</label>
        <input
          id={nameId}
          type="text"
          value={name}
          autoComplete="off"
          placeholder="例：緑茶 500ml"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={janId}>JANコード（8桁・13桁）</label>
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
          placeholder="4901234567894"
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setJan(event.target.value);
            if (error) setError(null);
          }}
        />

      </div>

      <aside className="validation-hint" id={hintId}>
        <strong>ⓘ チェックデジットを検証</strong>
        <p>登録前に番号の形式を確認します</p>
        <span className="visually-hidden">商品名は任意です。JANは半角数字で、先頭の0を省略せず入力してください。</span>
      </aside>

      {error && (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button button-primary">
          商品を追加する
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
