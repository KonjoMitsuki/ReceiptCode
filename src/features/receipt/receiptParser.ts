import { formatForLength, validateJan } from '../../lib/jan';
import { createId } from '../../lib/id';
import type {
  JanFormat,
  ReceiptItem,
  ValidationState,
} from '../../types/receipt';
import { matchItemNames, type ItemNameMatch } from './itemMatcher';
import {
  hasLetters,
  isDateOrTimeLine,
  isJanLabelLine,
  isNonProductLine,
} from './lineHeuristics';

export type CandidateContext = 'jan-label' | 'product' | 'unknown';

export interface JanCandidate {
  jan: string;
  format: JanFormat;
  lineIndex: number;
  start: number;
  end: number;
  rawText: string;
  context: CandidateContext;
  checkDigitValid: boolean;
  expectedCheckDigit: number | null;
  actualCheckDigit: number | null;
  needsReview: boolean;
  warnings: string[];
}

export interface ParsedReceipt {
  lines: string[];
  candidates: JanCandidate[];
  nameMatches: ItemNameMatch[];
  items: ReceiptItem[];
}

export interface ParseReceiptOptions {
  receiptId?: string;
  newId?: () => string;
}

const COMPACT_RE = /(?<!\d)(?:\d{13}|\d{8})(?!\d)/g;
const GROUPED_RE = /(?<!\d)\d{1,7}(?:[ -]\d{1,7}){1,3}(?!\d)/g;

const DASHES = new Set([
  '\u2010',
  '\u2011',
  '\u2012',
  '\u2013',
  '\u2014',
  '\u2015',
  '\u2212',
  '\u30FC',
  '\uFF0D',
]);

/**
 * 検出専用の正規化。文字数を変えないため、元の行に対する start/end と対応する。
 * 商品名の表示には元の行を使う（カタカナの「ー」を壊さない）。
 */
export function normalizeScanLine(line: string): string {
  return [...line]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0xff10 && code <= 0xff19) {
        return String.fromCharCode(code - 0xfee0);
      }
      if (char === '\u3000' || char === '\t' || char === '\u00a0') {
        return ' ';
      }
      if (DASHES.has(char)) return '-';
      return char;
    })
    .join('');
}

export function splitReceiptLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim());
}

function classifyLine(line: string): CandidateContext {
  if (isJanLabelLine(line)) return 'jan-label';
  if (isNonProductLine(line)) return 'product';
  return hasLetters(line) ? 'product' : 'unknown';
}

interface RawMatch {
  start: number;
  end: number;
  digits: string;
  separated: boolean;
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

function extractFromLine(
  line: string,
  allowShortGroups: boolean,
): RawMatch[] {
  const normalized = normalizeScanLine(line);
  const found: RawMatch[] = [];

  for (const match of normalized.matchAll(COMPACT_RE)) {
    const start = match.index;
    if (start === undefined) continue;
    found.push({
      start,
      end: start + match[0].length,
      digits: match[0],
      separated: false,
    });
  }

  for (const match of normalized.matchAll(GROUPED_RE)) {
    const start = match.index;
    if (start === undefined) continue;
    const groups = match[0].split(/[ -]/);
    const digits = groups.join('');
    if (digits.length !== 8 && digits.length !== 13) continue;

    // 「1234 5678」のような短い別フィールド同士は、JANラベルがある場合を除き
    // 無条件に連結しない。5桁以上のグループを含む印字だけを候補にする。
    const hasLongGroup = groups.some((group) => group.length >= 5);
    if (!hasLongGroup && !allowShortGroups) continue;

    found.push({
      start,
      end: start + match[0].length,
      digits,
      separated: true,
    });
  }

  const seen = new Set<string>();
  return found
    .filter((match) => {
      const key = `${match.start}:${match.end}:${match.digits}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function extractFromLines(lines: string[]): JanCandidate[] {
  const candidates: JanCandidate[] = [];

  lines.forEach((line, lineIndex) => {
    if (!line) return;

    const context = classifyLine(line);
    const normalized = normalizeScanLine(line);
    const isJanLabel = isJanLabelLine(line);
    const excluded =
      !isJanLabel &&
      (isNonProductLine(line) || isDateOrTimeLine(normalized));
    if (excluded) return;

    const matches = extractFromLine(line, isJanLabel);
    const multipleOnLine = matches.length > 1;

    for (const match of matches) {
      const validation = validateJan(match.digits);
      const format = formatForLength(match.digits.length);
      if (!format) continue;

      const warnings: string[] = [];
      let needsReview = false;

      if (!validation.valid) {
        warnings.push(
          validation.expectedCheckDigit === null
            ? 'JANとして不正な番号です。番号を確認してください。'
            : `チェックデジットが一致しません（期待値 ${validation.expectedCheckDigit} / 末尾 ${validation.actualCheckDigit}）。番号を確認してください。`,
        );
      }

      if (format === 'EAN8') {
        warnings.push(
          '8桁のJAN-8です。レジやスキャナーがJAN-8に対応しているか確認してください。',
        );
        needsReview = true;
      }

      if (match.separated) {
        warnings.push(
          '区切りのある数字を連結してJAN候補にしました。番号を確認してください。',
        );
        needsReview = true;
      }

      if (multipleOnLine) {
        warnings.push(
          '同じ行に複数のJAN候補があります。商品との対応を確認してください。',
        );
        needsReview = true;
      }

      candidates.push({
        jan: match.digits,
        format,
        lineIndex,
        start: match.start,
        end: match.end,
        rawText: line.slice(match.start, match.end),
        context,
        checkDigitValid: validation.valid,
        expectedCheckDigit: validation.expectedCheckDigit,
        actualCheckDigit: validation.actualCheckDigit,
        needsReview,
        warnings: uniqueWarnings(warnings),
      });
    }
  });

  return candidates;
}

export function extractJanCandidates(text: string): JanCandidate[] {
  return extractFromLines(splitReceiptLines(text));
}

export function parseReceipt(
  text: string,
  options: ParseReceiptOptions = {},
): ParsedReceipt {
  const lines = splitReceiptLines(text);
  const candidates = extractFromLines(lines);
  const nameMatches = matchItemNames(lines, candidates);
  const receiptId = options.receiptId ?? createId();
  const newId = options.newId ?? createId;

  const items = candidates.map((candidate, index) => {
    const nameMatch = nameMatches[index];
    const uncertainName =
      nameMatch.source === 'none' || nameMatch.confidence === 'low';

    let validation: ValidationState;
    if (!candidate.checkDigitValid) {
      validation = 'invalid';
    } else if (candidate.needsReview || uncertainName) {
      validation = 'needs-review';
    } else {
      validation = 'valid';
    }

    return {
      id: newId(),
      receiptId,
      name: nameMatch.name,
      jan: candidate.jan,
      format: candidate.format,
      validation,
      confirmed: candidate.checkDigitValid,
      source: 'ocr',
      sourceLine: candidate.lineIndex + 1,
      warnings: uniqueWarnings([...candidate.warnings, ...nameMatch.warnings]),
    } satisfies ReceiptItem;
  });

  return { lines, candidates, nameMatches, items };
}
