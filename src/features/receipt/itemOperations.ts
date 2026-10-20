import { validateJan } from '../../lib/jan';
import type { ReceiptItem, ValidationState } from '../../types/receipt';

export function validationForJan(jan: string): {
  validation: ValidationState;
  format: ReceiptItem['format'];
} {
  const result = validateJan(jan);
  return {
    validation: result.valid ? 'valid' : 'invalid',
    format: result.format,
  };
}

export function canConfirmItem(item: ReceiptItem): boolean {
  return validateJan(item.jan).valid;
}

export function isBarcodeEligible(item: ReceiptItem): boolean {
  return item.confirmed && validateJan(item.jan).valid;
}

export function getScannableItems(items: ReceiptItem[]): ReceiptItem[] {
  return items.filter(isBarcodeEligible);
}

export function getDuplicateJanCounts(
  items: ReceiptItem[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.jan) continue;
    counts.set(item.jan, (counts.get(item.jan) ?? 0) + 1);
  }
  return counts;
}

export function duplicateCountFor(
  items: ReceiptItem[],
  jan: string,
): number {
  return getDuplicateJanCounts(items).get(jan) ?? 0;
}
