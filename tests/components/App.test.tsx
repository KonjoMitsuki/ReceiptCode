import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import type { OcrEngineFactory } from '../../src/lib/ocr';

function createUnusedFactory() {
  return vi.fn<OcrEngineFactory>(async () => {
    throw new Error('OCR engine should not be used in this test');
  });
}

describe('App manual flow', () => {
  it('不正JANを修正し、確認後にバーコード表示まで進める', async () => {
    const user = userEvent.setup();
    const factory = createUnusedFactory();
    render(<App createOcrEngine={factory} />);

    await user.click(
      screen.getByRole('button', { name: 'JANを手入力して始める' }),
    );

    const nameInput = screen.getByLabelText('商品名（任意）');
    const janInput = screen.getByLabelText('JAN（8桁 / 13桁）');

    await user.type(nameInput, 'テスト商品');
    await user.type(janInput, '4901234567890');
    await user.click(screen.getByRole('button', { name: '一覧に追加' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'チェックデジットが一致しません',
    );

    await user.clear(janInput);
    await user.type(janInput, '4901234567894');
    await user.click(screen.getByRole('button', { name: '一覧に追加' }));

    const card = screen.getByRole('listitem', {
      name: /テスト商品 4901234567894/,
    });
    const checkbox = within(card).getByRole('checkbox', {
      name: '商品名とJANを確認しました',
    });
    const bulkBarcodeButton = screen.getByRole('button', {
      name: /確認済みのバーコードを表示/,
    });

    expect(bulkBarcodeButton).toHaveTextContent('（0件）');
    expect(bulkBarcodeButton).toBeDisabled();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(bulkBarcodeButton).toHaveTextContent('（1件）');
    expect(bulkBarcodeButton).toBeEnabled();

    await user.click(bulkBarcodeButton);

    expect(
      await screen.findByRole('img', {
        name: /EAN13 バーコード 4901234567894/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('テスト商品')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '一覧に戻る' }));

    const cardAfterReturn = screen.getByRole('listitem', {
      name: /テスト商品 4901234567894/,
    });
    const checkboxAfterReturn = within(cardAfterReturn).getByRole(
      'checkbox',
      { name: '商品名とJANを確認しました' },
    );
    expect(checkboxAfterReturn).toBeChecked();

    const janAfterReturn = within(cardAfterReturn).getByRole('textbox', {
      name: /JAN/,
    });
    await user.clear(janAfterReturn);
    await user.type(janAfterReturn, '4512345678906');

    expect(checkboxAfterReturn).not.toBeChecked();
    expect(
      screen.getByRole('button', {
        name: '確認済みのバーコードを表示（0件）',
      }),
    ).toBeDisabled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('手入力フォームで桁数不足のまま追加しない', async () => {
    const user = userEvent.setup();
    render(<App createOcrEngine={createUnusedFactory()} />);

    await user.click(
      screen.getByRole('button', { name: 'JANを手入力して始める' }),
    );
    await user.type(screen.getByLabelText('JAN（8桁 / 13桁）'), '1234567');
    await user.click(screen.getByRole('button', { name: '一覧に追加' }));

    expect(screen.getByRole('alert')).toHaveTextContent('8桁または13桁');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
