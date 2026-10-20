import { describe, expect, it } from 'vitest';
import {
  canConfirmItem,
  duplicateCountFor,
  getDuplicateJanCounts,
  getScannableItems,
  isBarcodeEligible,
  validationForJan,
} from '../../src/features/receipt/itemOperations';
import type { ReceiptItem } from '../../src/types/receipt';

function item(overrides: Partial<ReceiptItem>): ReceiptItem {
  return {
    id: 'item-1',
    receiptId: 'receipt-1',
    name: '牛乳',
    jan: '4901234567894',
    format: 'EAN13',
    validation: 'valid',
    confirmed: false,
    source: 'ocr',
    warnings: [],
    ...overrides,
  };
}

describe('itemOperations', () => {
  it('チェックデジットが有効なら要確認でも確認可能', () => {
    expect(canConfirmItem(item({ validation: 'needs-review' }))).toBe(true);
    expect(canConfirmItem(item({ jan: '4901234567890' }))).toBe(false);
  });

  it('確認済みかつチェックデジット有効のみバーコード対象にする', () => {
    expect(isBarcodeEligible(item({ confirmed: true }))).toBe(true);
    expect(isBarcodeEligible(item({ confirmed: false }))).toBe(false);
    expect(
      isBarcodeEligible(
        item({ confirmed: true, jan: '4901234567890', validation: 'invalid' }),
      ),
    ).toBe(false);
    expect(
      isBarcodeEligible(
        item({
          id: 'item-2',
          confirmed: true,
          validation: 'needs-review',
          jan: '12345670',
          format: 'EAN8',
        }),
      ),
    ).toBe(true);
  });

  it('重複JANを数えるが削除・統合はしない', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b' }),
      item({ id: 'c', jan: '12345670', format: 'EAN8' }),
    ];
    expect(getDuplicateJanCounts(items).get('4901234567894')).toBe(2);
    expect(duplicateCountFor(items, '4901234567894')).toBe(2);
    expect(getScannableItems(items)).toHaveLength(0);
  });

  it('JAN編集後の検証状態を返す', () => {
    expect(validationForJan('4901234567894')).toEqual({
      validation: 'valid',
      format: 'EAN13',
    });
    expect(validationForJan('4901234567890')).toEqual({
      validation: 'invalid',
      format: 'EAN13',
    });
    expect(validationForJan('1234567')).toEqual({
      validation: 'invalid',
      format: null,
    });
  });
});
