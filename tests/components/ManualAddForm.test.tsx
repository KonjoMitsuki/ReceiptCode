import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ManualAddForm } from '../../src/components/ManualAddForm';

describe('ManualAddForm', () => {
  it('チェックデジットが正しいJANを追加する', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<ManualAddForm onAdd={onAdd} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('商品名（任意）'), '牛乳 1L');
    await user.type(
      screen.getByLabelText('JAN（8桁 / 13桁）'),
      '4901234567894',
    );
    await user.click(screen.getByRole('button', { name: '一覧に追加' }));

    expect(onAdd).toHaveBeenCalledWith('牛乳 1L', '4901234567894');
  });

  it('先頭0を含むEAN-13をそのまま渡す', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<ManualAddForm onAdd={onAdd} onCancel={vi.fn()} />);
    await user.type(
      screen.getByLabelText('JAN（8桁 / 13桁）'),
      '0123456789012',
    );
    await user.click(screen.getByRole('button', { name: '一覧に追加' }));

    expect(onAdd).toHaveBeenCalledWith('', '0123456789012');
  });

  it('チェックデジット不正は追加せず修正を促す', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<ManualAddForm onAdd={onAdd} onCancel={vi.fn()} />);
    await user.type(
      screen.getByLabelText('JAN（8桁 / 13桁）'),
      '4901234567890',
    );
    await user.click(screen.getByRole('button', { name: '一覧に追加' }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'チェックデジットが一致しません。期待値は 4 です。',
    );
  });

  it('桁数不足は追加せずエラーを表示する', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<ManualAddForm onAdd={onAdd} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText('JAN（8桁 / 13桁）'), '1234567');
    await user.click(screen.getByRole('button', { name: '一覧に追加' }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '8桁または13桁',
    );
  });

  it('閉じる操作を通知する', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<ManualAddForm onAdd={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
