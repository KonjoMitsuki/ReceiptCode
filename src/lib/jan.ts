import type { JanFormat } from '../types/receipt';

export type JanValidationReason =
  | 'ok'
  | 'invalid-length'
  | 'invalid-characters'
  | 'invalid-check-digit';

export interface JanValidation {
  /** 入力された文字列。数値型への変換は行わない。 */
  jan: string;
  format: JanFormat | null;
  valid: boolean;
  reason: JanValidationReason;
  expectedCheckDigit: number | null;
  actualCheckDigit: number | null;
}

export function formatForLength(length: number): JanFormat | null {
  if (length === 13) return 'EAN13';
  if (length === 8) return 'EAN8';
  return null;
}

/**
 * EAN-13 は先頭12桁、EAN-8 は先頭7桁のチェックデジットを返す。
 * 入力は数字文字列のまま扱い、数値型には変換しない。
 */
export function computeJanCheckDigit(body: string): number {
  if (!/^\d+$/.test(body) || (body.length !== 12 && body.length !== 7)) {
    throw new Error('チェックデジットの計算には12桁または7桁の数字が必要です');
  }

  const sum = [...body].reduce((total, char, index) => {
    const digit = char.charCodeAt(0) - 48;
    const weight =
      body.length === 12
        ? index % 2 === 0
          ? 1
          : 3
        : index % 2 === 0
          ? 3
          : 1;
    return total + digit * weight;
  }, 0);

  return (10 - (sum % 10)) % 10;
}

export function validateJan(jan: string): JanValidation {
  const base = {
    jan,
    format: formatForLength(jan.length),
    expectedCheckDigit: null,
    actualCheckDigit: null,
  } as const;

  if (jan.length === 0) {
    return { ...base, valid: false, reason: 'invalid-length' };
  }

  if (!/^\d+$/.test(jan)) {
    return { ...base, valid: false, reason: 'invalid-characters' };
  }

  if (jan.length !== 8 && jan.length !== 13) {
    return { ...base, valid: false, reason: 'invalid-length' };
  }

  const expectedCheckDigit = computeJanCheckDigit(jan.slice(0, -1));
  const actualCheckDigit = jan.charCodeAt(jan.length - 1) - 48;

  if (expectedCheckDigit !== actualCheckDigit) {
    return {
      ...base,
      format: formatForLength(jan.length),
      valid: false,
      reason: 'invalid-check-digit',
      expectedCheckDigit,
      actualCheckDigit,
    };
  }

  return {
    ...base,
    format: formatForLength(jan.length),
    valid: true,
    reason: 'ok',
    expectedCheckDigit,
    actualCheckDigit,
  };
}

export function isValidJan(jan: string): boolean {
  return validateJan(jan).valid;
}

export function formatLabel(format: JanFormat): string {
  return format === 'EAN13' ? 'JAN-13（EAN-13）' : 'JAN-8（EAN-8）';
}
