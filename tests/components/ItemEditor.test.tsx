import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItemEditor } from '../../src/components/ItemEditor';
import type { ReceiptItem } from '../../src/types/receipt';

function item(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    id: 'item-1',
    receiptId: 'receipt-1',
    name: '牛乳 1L',
    jan: '4901234567894',
    format: 'EAN13',
    validation: 'valid',
    confirmed: false,
    source: 'ocr',
    sourceLine: 5,
    warnings: [],
    ...overrides,
  };
}

function renderEditor(overrides: Partial<ReceiptItem> = {}, duplicateCount = 1) {
  const onUpdate = vi.fn();
  const onDelete = vi.fn();
  const onToggleConfirm = vi.fn();

  render(
    <ul>
      <ItemEditor
        item={item(overrides)}
        duplicateCount={duplicateCount}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onToggleConfirm={onToggleConfirm}
      />
    </ul>,
  );

  return { onUpdate, onDelete, onToggleConfirm };
}

describe('ItemEditor', () => {
  it('カード内に個別のバーコード表示ボタンを置かない', () => {
    renderEditor();

    expect(screen.getByText('有効')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: '商品名とJANを確認しました',
      }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'バーコードを表示' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '牛乳 1Lを削除' }),
    ).toBeInTheDocument();
    expect(screen.getByText('OCR行 5')).toBeInTheDocument();
  });

  it('確認操作を親へ通知する', async () => {
    const user = userEvent.setup();
    const { onToggleConfirm } = renderEditor();

    await user.click(
      screen.getByRole('checkbox', {
        name: '商品名とJANを確認しました',
      }),
    );
    expect(onToggleConfirm).toHaveBeenCalledTimes(1);
  });

  it('確認済みの状態を表示する', () => {
    renderEditor({ confirmed: true });
    expect(screen.getByText('確認済み')).toBeInTheDocument();
  });

  it('不正JANは確認を無効にし理由を表示する', () => {
    renderEditor({ jan: '4901234567890', format: 'EAN13' });

    expect(
      screen.getByRole('checkbox', {
        name: '商品名とJANを確認しました',
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(/チェックデジットが一致しません/),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /JAN/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('要確認でもチェックデジットが有効なら確認できる', () => {
    renderEditor({ validation: 'needs-review', confirmed: true });
    expect(screen.getByText('要確認')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: '商品名とJANを確認しました',
      }),
    ).toBeEnabled();
  });

  it('商品名・JANの編集を通知する', () => {
    const { onUpdate } = renderEditor();
    const name = screen.getByRole('textbox', { name: '商品名' });
    const jan = screen.getByRole('textbox', { name: /JAN/ });

    fireEvent.change(name, { target: { value: '低脂肪乳' } });
    fireEvent.change(jan, { target: { value: '4512345678906' } });

    expect(onUpdate).toHaveBeenCalledWith({ name: '低脂肪乳' });
    expect(onUpdate).toHaveBeenCalledWith({ jan: '4512345678906' });
  });

  it('重複JANは自動統合しない旨を表示する', () => {
    renderEditor({}, 2);
    expect(
      screen.getByText(/同じJANが他に1件あります/),
    ).toBeInTheDocument();
  });

  it('削除は確認後に実行する', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onDelete } = renderEditor();

    await user.click(
      screen.getByRole('button', { name: '牛乳 1Lを削除' }),
    );
    expect(confirm).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
