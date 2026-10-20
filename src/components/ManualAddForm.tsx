import { useId, useState, type FormEvent } from 'react';
import { validateJan } from '../lib/jan';
import { Button } from './m3e/button';
import { Field, FieldDescription, FieldError, FieldLabel } from './m3e/field';
import { Icon } from './m3e/icon';
import { Input } from './m3e/input';

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
      className="manual-form rounded-2xl border border-outline-variant bg-surface-container-low p-4 shadow-elevation-1 sm:p-5"
      aria-labelledby={`${formId}-title`}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container">
          <Icon name="keyboard" size={20} />
        </span>
        <div>
          <h2
            id={`${formId}-title`}
            className="text-title-large-emphasized text-on-surface"
          >
            JANを手入力で追加
          </h2>
          <p className="hint mt-1 text-body-small text-on-surface-variant">
            商品名は任意です。JANは先頭の0を省略せず、全桁を入力してください。
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <Field>
          <FieldLabel htmlFor={nameId}>商品名（任意）</FieldLabel>
          <Input
            id={nameId}
            type="text"
            value={name}
            autoComplete="off"
            placeholder="例: 牛乳 1L"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor={janId}>JAN（8桁 / 13桁）</FieldLabel>
          <Input
            id={janId}
            className="jan-input font-mono text-title-large tracking-wider"
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
          <FieldDescription id={hintId}>
            半角数字のみ・チェックデジットも含めて入力
          </FieldDescription>
        </Field>

        {error && (
          <FieldError id={errorId} className="form-error">
            {error}
          </FieldError>
        )}
      </div>

      <div className="form-actions mt-4 grid grid-cols-2 gap-2">
        <Button type="submit" size="md">
          <Icon name="add" size={20} />
          一覧に追加
        </Button>
        <Button
          type="button"
          variant="outlined"
          size="md"
          onClick={onCancel}
        >
          閉じる
        </Button>
      </div>
    </form>
  );
}
