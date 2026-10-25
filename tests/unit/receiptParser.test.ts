import { describe, expect, it } from 'vitest';
import {
  extractJanCandidates,
  normalizeScanLine,
  parseReceipt,
  splitReceiptLines,
} from '../../src/features/receipt/receiptParser';
import { FIXTURE_RECEIPT_TEXT } from '../../src/lib/testing/receiptFixture';

describe('normalizeScanLine', () => {
  it('全角数字・全角スペース・各種ダッシュを検出用に正規化する', () => {
    expect(normalizeScanLine('４９０１　２３４５')).toBe('4901 2345');
    expect(normalizeScanLine('4901234ー567894')).toBe('4901234-567894');
  });

  it('カタカナの長音は商品名側で保持できるよう正規化対象を限定する', () => {
    expect(splitReceiptLines('コーヒー 1L\r\n4901234567894')).toEqual([
      'コーヒー 1L',
      '4901234567894',
    ]);
  });
});

describe('extractJanCandidates', () => {
  it('改行・スペース・ハイフン・全角数字を扱う', () => {
    expect(
      extractJanCandidates('商品A\n4901234567894\n商品B\n４９０１２３４５６７８９４')
        .map((candidate) => candidate.jan),
    ).toEqual(['4901234567894', '4901234567894']);

    expect(
      extractJanCandidates('JAN 4901234 567894').map(
        (candidate) => candidate.jan,
      ),
    ).toEqual(['4901234567894']);

    expect(
      extractJanCandidates('JAN 4901234-567894').map(
        (candidate) => candidate.jan,
      ),
    ).toEqual(['4901234567894']);
  });

  it('短い別フィールド同士を無条件に連結しない', () => {
    expect(extractJanCandidates('1234 5678')).toHaveLength(0);
  });

  it('JANラベルがある場合のみ短いグループの連結を許す', () => {
    const candidates = extractJanCandidates('JAN 1234 5678');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].jan).toBe('12345678');
    expect(candidates[0].needsReview).toBe(true);
    expect(candidates[0].warnings.join(' ')).toContain('連結');
  });

  it('日付・時刻・電話・会員番号・合計金額を誤検出しない', () => {
    const text = [
      '2026-10-20',
      '2026年10月20日 12:34',
      '20261020',
      'TEL 03-1234-5678',
      '電話 03-1234-5678',
      '会員番号 12345670',
      '合計 4901234567894円',
      'お預り 2,000円',
    ].join('\n');

    expect(extractJanCandidates(text)).toHaveLength(0);
  });

  it('同じJANが複数回登場しても自動で統合・削除しない', () => {
    const candidates = extractJanCandidates(
      '牛乳\n4901234567894\nりんご\n4901234567894',
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.jan === '4901234567894')).toBe(
      true,
    );
  });

  it('同一行に複数候補がある場合は要確認にする', () => {
    const candidates = extractJanCandidates(
      'まとめ 4901234567894 12345670',
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.needsReview)).toBe(true);
    expect(candidates[0].warnings.join(' ')).toContain('複数のJAN候補');
  });

  it('チェックデジット不正でも商品行の候補はinvalidとして残す', () => {
    const candidates = extractJanCandidates('バナナ 4901234567890');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].checkDigitValid).toBe(false);
    expect(candidates[0].warnings.join(' ')).toContain(
      'チェックデジットが一致しません',
    );
  });

  it('先頭ゼロを保持する', () => {
    const candidates = extractJanCandidates('JAN 0123456789012');
    expect(candidates[0].jan).toBe('0123456789012');
    expect(candidates[0].jan.startsWith('0')).toBe(true);
  });
});

describe('parseReceipt', () => {
  it('架空レシートから商品名とJANを対応付ける', () => {
    const parsed = parseReceipt(FIXTURE_RECEIPT_TEXT, {
      receiptId: 'receipt-test',
      newId: (() => {
        let index = 0;
        return () => `item-${++index}`;
      })(),
    });

    expect(parsed.items).toHaveLength(5);

    expect(
      parsed.items.map((item) => ({
        name: item.name,
        jan: item.jan,
        validation: item.validation,
      })),
    ).toEqual([
      { name: '牛乳 1L', jan: '4901234567894', validation: 'valid' },
      {
        name: '食パン 8枚切',
        jan: '4512345678906',
        validation: 'valid',
      },
      { name: 'ヨーグルト 400g', jan: '12345670', validation: 'needs-review' },
      { name: 'りんご 1個', jan: '4901234567894', validation: 'needs-review' },
      { name: 'バナナ', jan: '4901234567890', validation: 'invalid' },
    ]);

    expect(parsed.items[3].warnings.join(' ')).toContain('前後の行');
    expect(parsed.items.map(item => item.confirmed)).toEqual([true, true, true, true, false]);
    expect(parsed.items.every((item) => item.source === 'ocr')).toBe(true);
    expect(parsed.items[0].receiptId).toBe('receipt-test');
    expect(parsed.items[0].sourceLine).toBe(5);
  });

  it('会員番号として印字されたEAN-8は候補にしない', () => {
    const parsed = parseReceipt(FIXTURE_RECEIPT_TEXT);
    const ean8Items = parsed.items.filter((item) => item.jan === '12345670');
    expect(ean8Items).toHaveLength(1);
    expect(ean8Items[0].name).toBe('ヨーグルト 400g');
  });

  it('JANの直上・直下・同じ行から商品名を推定する', () => {
    const sameLine = parseReceipt('牛乳 4901234567894 198円');
    expect(sameLine.items[0].name).toBe('牛乳');
    expect(sameLine.items[0].validation).toBe('valid');

    const previous = parseReceipt('牛乳\n4901234567894');
    expect(previous.items[0].name).toBe('牛乳');
    expect(previous.items[0].validation).toBe('valid');

    const next = parseReceipt('4901234567894\n牛乳');
    expect(next.items[0].name).toBe('牛乳');
    expect(next.items[0].validation).toBe('valid');
  });

  it('商品名を推定できない場合は空文字にして要確認にする', () => {
    const parsed = parseReceipt('サンプルマート 駅前店\n4901234567894');
    expect(parsed.items[0].name).toBe('');
    expect(parsed.items[0].validation).toBe('needs-review');
    expect(parsed.items[0].warnings.join(' ')).toContain(
      '商品名を推定できませんでした',
    );
  });

  it('前後の行に商品名候補がある場合は低信頼として要確認にする', () => {
    const parsed = parseReceipt('牛乳\n4901234567894\n食パン');
    expect(parsed.items[0].name).toBe('牛乳');
    expect(parsed.items[0].validation).toBe('needs-review');
    expect(parsed.items[0].warnings.join(' ')).toContain('前後の行');
  });

  it('2行離れた商品名は低信頼として要確認にする', () => {
    const parsed = parseReceipt('牛乳\n\n4901234567894');
    expect(parsed.items[0].name).toBe('牛乳');
    expect(parsed.items[0].validation).toBe('needs-review');
    expect(parsed.items[0].warnings.join(' ')).toContain('近接行');
  });

  it('別商品のJAN行を商品名として採用しない', () => {
    const parsed = parseReceipt(
      '牛乳\n4901234567894\n12345670\nヨーグルト',
    );
    const second = parsed.items[1];
    expect(second.jan).toBe('12345670');
    expect(second.name).toBe('ヨーグルト');
  });
});
