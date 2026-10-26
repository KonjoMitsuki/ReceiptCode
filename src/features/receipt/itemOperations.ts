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

/** Shared JAN/name edit behavior for the normal and comparison confirmation screens. */
export function updateReceiptItem(
  item: ReceiptItem,
  patch: Partial<Pick<ReceiptItem, 'name' | 'jan'>>,
): ReceiptItem {
  const janChanged = patch.jan !== undefined && patch.jan !== item.jan;
  const nextJan = patch.jan ?? item.jan;
  const nextName = patch.name ?? item.name;
  const { validation, format } = validationForJan(nextJan);
  let warnings = janChanged
    ? item.warnings.filter((warning) => warning.startsWith('商品名'))
    : item.warnings;
  if (patch.name !== undefined && nextName.trim()) {
    warnings = warnings.filter((warning) => !warning.includes('商品名を推定できませんでした'));
  }
  return {
    ...item, ...patch, format, warnings, confirmed: false,
    validation: janChanged || item.validation === 'invalid' ? validation : item.validation,
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
