import { describe, expect, it } from 'vitest';
import {
  computeJanCheckDigit,
  formatForLength,
  isValidJan,
  validateJan,
} from '../../src/lib/jan';

describe('validateJan', () => {
  it('EAN-13のチェックデジットが正しい場合はvalid', () => {
    const result = validateJan('4901234567894');
    expect(result.valid).toBe(true);
    expect(result.format).toBe('EAN13');
    expect(result.reason).toBe('ok');
  });

  it('EAN-8のチェックデジットが正しい場合はvalid', () => {
    const result = validateJan('12345670');
    expect(result.valid).toBe(true);
    expect(result.format).toBe('EAN8');
  });

  it('チェックデジットが一致しない場合はinvalid-check-digit', () => {
    const result = validateJan('4901234567890');
    expect(result.valid).toBe(false);
    expect(result.format).toBe('EAN13');
    expect(result.reason).toBe('invalid-check-digit');
    expect(result.expectedCheckDigit).toBe(4);
    expect(result.actualCheckDigit).toBe(0);
  });

  it.each(['1234567', '123456789', '123456789012', '12345678901234'])(
    '%s桁はinvalid-length',
    (jan) => {
      const result = validateJan(jan);
      expect(result.valid).toBe(false);
      expect(result.format).toBeNull();
      expect(result.reason).toBe('invalid-length');
    },
  );

  it.each(['49012345678A4', '4901 234 567894', '４９０１２３４５６７８９４'])(
    '%sは数字以外を含むためinvalid-characters',
    (jan) => {
      const result = validateJan(jan);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid-characters');
    },
  );

  it('先頭0を数値化せず、文字列として保持する', () => {
    expect(isValidJan('0123456789012')).toBe(true);
    expect(isValidJan('01234565')).toBe(true);

    const result = validateJan('0123456789012');
    expect(result.valid).toBe(true);
    expect(typeof result.jan).toBe('string');
    expect(result.jan.startsWith('0')).toBe(true);
  });

  it('空文字はinvalid-length', () => {
    const result = validateJan('');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid-length');
  });
});

describe('computeJanCheckDigit', () => {
  it('EAN-13のチェックデジットを計算する', () => {
    expect(computeJanCheckDigit('490123456789')).toBe(4);
    expect(computeJanCheckDigit('012345678901')).toBe(2);
  });

  it('EAN-8のチェックデジットを計算する', () => {
    expect(computeJanCheckDigit('1234567')).toBe(0);
    expect(computeJanCheckDigit('0123456')).toBe(5);
  });

  it('対象外の桁数では例外を投げる', () => {
    expect(() => computeJanCheckDigit('123456')).toThrow();
    expect(() => computeJanCheckDigit('1234567890123')).toThrow();
    expect(() => computeJanCheckDigit('49012345678A')).toThrow();
  });
});

describe('formatForLength', () => {
  it('13桁と8桁だけ形式を返す', () => {
    expect(formatForLength(13)).toBe('EAN13');
    expect(formatForLength(8)).toBe('EAN8');
    expect(formatForLength(12)).toBeNull();
    expect(formatForLength(14)).toBeNull();
  });
});
