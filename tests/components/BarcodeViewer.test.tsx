import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BarcodeViewer } from '../../src/components/BarcodeViewer';
import type { ReceiptItem } from '../../src/types/receipt';

function item(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    id: 'item-1',
    receiptId: 'receipt-1',
    name: '牛乳 1L',
    jan: '4901234567894',
    format: 'EAN13',
    validation: 'valid',
    confirmed: true,
    source: 'ocr',
    warnings: [],
    ...overrides,
  };
}

function renderViewer(overrides: Partial<ReceiptItem> = {}) {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const onClose = vi.fn();

  render(
    <BarcodeViewer
      item={item(overrides)}
      index={0}
      total={2}
      hasPrevious={false}
      hasNext
      onPrevious={onPrevious}
      onNext={onNext}
      onClose={onClose}
    />,
  );

  return { onPrevious, onNext, onClose };
}

describe('BarcodeViewer', () => {
  it('有効なJANのSVGバーコードと数字を表示する', async () => {
    renderViewer();

    expect(screen.getByLabelText('JAN 4901234567894')).toBeInTheDocument();
    expect(
      await screen.findByRole('img', {
        name: /EAN13 バーコード 4901234567894/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('牛乳 1L')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '次へ' })).toBeEnabled();
  });

  it('前へ・次へ・一覧に戻るを呼び出す', async () => {
    const user = userEvent.setup();
    const { onNext, onClose } = renderViewer();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(onNext).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '確認画面に戻る' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('集中表示では案内を減らし、終了できる', async () => {
    const user = userEvent.setup();
    renderViewer();

    expect(
      screen.getByText('画面の明るさを上げてください。'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '全画面で表示' }));

    expect(
      screen.queryByText('画面の明るさを上げてください。'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '集中表示を終了' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('JAN 4901234567894')).toBeInTheDocument();
  });

  it('不正JANはバーコードを描画せず理由を表示する', async () => {
    renderViewer({ jan: '4901234567890' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'チェックデジットが一致しません',
    );
    expect(
      screen.queryByRole('img', { name: /バーコード/ }),
    ).not.toBeInTheDocument();
  });

  it('Wake Lock非対応でもメニューから状態を確認できる', async () => {
    renderViewer();
    await userEvent.click(screen.getByLabelText('その他の操作'));
    expect(
      screen.getByRole('status'),
    ).toHaveTextContent('自動ロック防止に対応していません');
  });
});
