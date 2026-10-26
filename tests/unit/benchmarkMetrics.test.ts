import { describe, expect, it } from 'vitest';
import { aggregateAccuracy, alignText, characterDistance, evaluate } from '../../src/features/ocr-benchmark/metrics';

describe('OCRベンチマークの厳密評価', () => {
  it('Unicodeコードポイントで挿入・削除・置換を数え、改行以外は正規化しない', () => {
    expect(characterDistance('牛乳🍵\r\n１２', '牛肉🍵\n12!')).toBe(4);
    expect(characterDistance('ab', '')).toBe(2);
    expect(characterDistance('', 'abc')).toBe(3);
    expect(characterDistance('A B', 'ab')).toBe(3);
    expect(characterDistance('同じ\r文字', '同じ\n文字')).toBe(0);
  });

  it('差分から両テキストを復元でき、巨大な差分行列は作らない', () => {
    for (const [expected, actual] of [['牛乳', '牛肉!'], ['abc', 'ac'], ['', 'a'], ['🍵', '🍵']]) {
      const edits = alignText(expected, actual)!;
      expect(edits.map((edit) => edit.expected).join('')).toBe(expected);
      expect(edits.map((edit) => edit.actual).join('')).toBe(actual);
      expect(edits.filter((edit) => edit.kind !== 'equal')).toHaveLength(characterDistance(expected, actual));
    }
    expect(alignText('a'.repeat(1500), 'b'.repeat(1500))).toBeNull();
  });

  it('8桁・13桁JANと商品名を共通パーサーで完全一致・重複消費する', () => {
    const text = '牛乳\n4901234567894\nお茶\n49012347';
    const accuracy = evaluate({ text, jans: ['4901234567894', '4901234567894', '49012347'], productNames: ['牛乳', '牛乳', 'お茶', '牛'] }, text);
    expect(accuracy.cer).toBe(0);
    expect(accuracy.janMatches).toBe(2);
    expect(accuracy.janAccuracy).toBeCloseTo(2 / 3);
    expect(accuracy.productMatches).toBe(2);
    expect(accuracy.productAccuracy).toBe(0.5);
  });

  it('正解件数ゼロは未定義とし、集計は件数で加重する（CERは100%を超え得る）', () => {
    const first = evaluate({ text: 'a', jans: [], productNames: [] }, 'abc');
    const second = evaluate({ text: 'abcdefghi', jans: [], productNames: [] }, 'abcdefghi');
    expect(first.cer).toBe(2);
    expect(first.janAccuracy).toBeNull();
    expect(first.productAccuracy).toBeNull();
    expect(aggregateAccuracy([first, second]).cer).toBe(0.2);
    expect(aggregateAccuracy([]).cer).toBeNull();
  });
});
