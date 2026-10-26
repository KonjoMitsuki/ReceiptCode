import { parseReceipt } from '../receipt/receiptParser';
import type { Accuracy, GroundTruth } from './types';

// 厳密評価: CRLF/CRのみLFに統一。空白、全半角、大文字小文字は変えない。
export const normalizeText = (text: string) => text.replace(/\r\n?/g, '\n');

export interface TextEdit {
  kind: 'equal' | 'insert' | 'delete' | 'replace';
  expected: string;
  actual: string;
}

/** Unicodeコードポイント単位。距離計算はO(mn)時間・O(n)メモリ。 */
export function characterDistance(expected: string, actual: string): number {
  const a = Array.from(normalizeText(expected));
  const b = Array.from(normalizeText(actual));
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

/** ハイライト用アラインメント。巨大入力の二次メモリ消費を制限する。 */
export function alignText(expected: string, actual: string): TextEdit[] | null {
  const a = Array.from(normalizeText(expected));
  const b = Array.from(normalizeText(actual));
  if ((a.length + 1) * (b.length + 1) > 2_000_000) return null;
  const width = b.length + 1;
  const matrix = new Uint32Array((a.length + 1) * width);
  for (let i = 0; i <= a.length; i += 1) matrix[i * width] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i * width + j] = Math.min(matrix[(i - 1) * width + j] + 1,
        matrix[i * width + j - 1] + 1,
        matrix[(i - 1) * width + j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const edits: TextEdit[] = [];
  let i = a.length;
  let j = b.length;
  while (i || j) {
    const value = matrix[i * width + j];
    if (i && j && a[i - 1] === b[j - 1]) {
      edits.push({ kind: 'equal', expected: a[--i], actual: b[--j] });
    } else if (i && j && value === matrix[(i - 1) * width + j - 1] + 1) {
      edits.push({ kind: 'replace', expected: a[--i], actual: b[--j] });
    } else if (i && value === matrix[(i - 1) * width + j] + 1) {
      edits.push({ kind: 'delete', expected: a[--i], actual: '' });
    } else {
      edits.push({ kind: 'insert', expected: '', actual: b[--j] });
    }
  }
  return edits.reverse();
}

function countMatches(expected: string[], actual: string[]): number {
  const remaining = new Map<string, number>();
  for (const value of actual) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  let matches = 0;
  for (const value of expected) {
    const count = remaining.get(value) ?? 0;
    if (count > 0) {
      matches += 1;
      remaining.set(value, count - 1);
    }
  }
  return matches;
}

export function accuracyFromCounts(counts: Omit<Accuracy, 'cer' | 'janAccuracy' | 'productAccuracy'>): Accuracy {
  return {
    ...counts,
    cer: counts.characters ? counts.characterErrors / counts.characters : null,
    janAccuracy: counts.janCount ? counts.janMatches / counts.janCount : null,
    productAccuracy: counts.productCount ? counts.productMatches / counts.productCount : null,
  };
}

export function evaluate(truth: GroundTruth, text: string): Accuracy {
  // 全エンジン共通の既存パーサーで抽出し、重複も1件ずつ消費する。
  const parsed = parseReceipt(text);
  return accuracyFromCounts({
    characterErrors: characterDistance(truth.text, text),
    characters: Array.from(normalizeText(truth.text)).length,
    janMatches: countMatches(truth.jans, parsed.candidates.map((item) => item.jan)),
    janCount: truth.jans.length,
    productMatches: countMatches(truth.productNames, parsed.items.map((item) => item.name)),
    productCount: truth.productNames.length,
  });
}

export function aggregateAccuracy(values: Accuracy[]): Accuracy {
  return accuracyFromCounts(values.reduce((sum, value) => ({
    characterErrors: sum.characterErrors + value.characterErrors,
    characters: sum.characters + value.characters,
    janMatches: sum.janMatches + value.janMatches,
    janCount: sum.janCount + value.janCount,
    productMatches: sum.productMatches + value.productMatches,
    productCount: sum.productCount + value.productCount,
  }), { characterErrors: 0, characters: 0, janMatches: 0, janCount: 0, productMatches: 0, productCount: 0 }));
}
