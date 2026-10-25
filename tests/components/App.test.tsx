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

    await user.click(screen.getByLabelText('その他の操作'));
    await user.click(
      screen.getByRole('button', { name: 'JANを手入力して始める' }),
    );

    const nameInput = screen.getByLabelText('商品名');
    const janInput = screen.getByLabelText('JANコード（8桁・13桁）');

    await user.type(nameInput, 'テスト商品');
    await user.type(janInput, '4901234567890');
    await user.click(screen.getByRole('button', { name: '商品を追加する' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'チェックデジットが一致しません',
    );

    await user.clear(janInput);
    await user.type(janInput, '4901234567894');
    await user.click(screen.getByRole('button', { name: '商品を追加する' }));

    const card = screen.getByRole('listitem', {
      name: /テスト商品 4901234567894/,
    });
    await user.click(within(card).getByRole('button', { name: 'テスト商品の内容を確認・編集' }));
    const checkbox = within(card).getByRole('checkbox', {
      name: '商品名とJANを確認しました',
    });
    const bulkBarcodeButton = screen.getByRole('button', {
      name: '次へ',
    });

    expect(checkbox).toBeChecked();
    expect(bulkBarcodeButton).toBeEnabled();
    await user.click(checkbox);
    expect(within(screen.getByRole('region', { name: 'バーコード表示へ進む' })).getByText('0件')).toBeVisible();
    expect(bulkBarcodeButton).toBeDisabled();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(within(screen.getByRole('region', { name: 'バーコード表示へ進む' })).getByText('1件')).toBeVisible();
    expect(bulkBarcodeButton).toBeEnabled();

    await user.click(bulkBarcodeButton);

    expect(
      await screen.findByRole('img', {
        name: /EAN13 バーコード 4901234567894/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('テスト商品')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '確認画面に戻る' }));

    const cardAfterReturn = screen.getByRole('listitem', {
      name: /テスト商品 4901234567894/,
    });
    await user.click(within(cardAfterReturn).getByRole('button', { name: 'テスト商品の内容を確認・編集' }));
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
        name: '次へ',
      }),
    ).toBeDisabled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('手入力フォームで桁数不足のまま追加しない', async () => {
    const user = userEvent.setup();
    render(<App createOcrEngine={createUnusedFactory()} />);

    await user.click(screen.getByLabelText('その他の操作'));
    await user.click(
      screen.getByRole('button', { name: 'JANを手入力して始める' }),
    );
    await user.type(screen.getByLabelText('JANコード（8桁・13桁）'), '1234567');
    await user.click(screen.getByRole('button', { name: '商品を追加する' }));

    expect(screen.getByRole('alert')).toHaveTextContent('8桁または13桁');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('追加画面のキャンセル・戻るで既存商品と確認状態を保持する', async () => {
    const user = userEvent.setup();
    render(<App createOcrEngine={createUnusedFactory()} />);
    await user.click(screen.getByLabelText('その他の操作'));
    await user.click(screen.getByRole('button', { name: 'JANを手入力して始める' }));
    await user.type(screen.getByLabelText('商品名'), '保存される商品');
    await user.type(screen.getByLabelText('JANコード（8桁・13桁）'), '0123456789012');
    await user.click(screen.getByRole('button', { name: '商品を追加する' }));
    await user.click(screen.getByRole('button', { name: '保存される商品の内容を確認・編集' }));
    expect(screen.getByRole('checkbox')).toBeChecked();

    for (const exit of ['キャンセル', '‹ 商品一覧']) {
      await user.click(screen.getByRole('button', { name: '＋ 商品を手動追加' }));
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
      await user.type(screen.getByLabelText('商品名'), '未登録の商品');
      await user.click(screen.getByRole('button', { name: exit }));
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
      expect(screen.getByRole('button', { name: '次へ' })).toBeEnabled();
      expect(screen.queryByText('未登録の商品')).not.toBeInTheDocument();
    }
  });

  it('商品確認後に一括で進み、次へで順番に表示し、再編集で確認が解除される', async () => {
    const user = userEvent.setup();
    render(<App createOcrEngine={createUnusedFactory()} />);
    await user.click(screen.getByLabelText('その他の操作'));
    await user.click(screen.getByRole('button', { name: 'JANを手入力して始める' }));
    for (const [index, name, jan] of [[0, '商品A', '4901234567894'], [1, '商品B', '12345670']] as const) {
      if (index) await user.click(screen.getByRole('button', { name: '＋ 商品を手動追加' }));
      await user.type(screen.getByLabelText('商品名'), name);
      await user.type(screen.getByLabelText('JANコード（8桁・13桁）'), jan);
      await user.click(screen.getByRole('button', { name: '商品を追加する' }));
      const card = screen.getByRole('listitem', { name: `${name} ${jan}` });
      expect(within(card).getByRole('checkbox')).toBeChecked();
      await user.click(within(card).getByRole('button', { name: `${name}の内容を確認・編集` }));
      expect(screen.queryByRole('main', { name: 'JANバーコード表示' })).not.toBeInTheDocument();
      expect(within(card).getByRole('checkbox')).toBeChecked();
    }
    await user.click(screen.getByRole('button', { name: '商品Bの商品詳細' }));
    expect(screen.queryByRole('main', { name: 'JANバーコード表示' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(await screen.findByRole('img', { name: 'EAN13 バーコード 4901234567894' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeVisible();
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(await screen.findByRole('img', { name: 'EAN8 バーコード 12345670' })).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeVisible();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '確認画面に戻る' }));
    await user.click(screen.getByRole('button', { name: '商品Bの内容を確認・編集' }));
    const card = screen.getByRole('listitem', { name: '商品B 12345670' });
    await user.type(within(card).getByRole('textbox', { name: '商品名' }), '改');
    expect(within(card).getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: '商品B改のバーコードを表示' })).not.toBeInTheDocument();
  });
});
