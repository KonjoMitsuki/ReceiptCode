import type { JanCandidate } from './receiptParser';
import {
  cleanProductName,
  isLikelyProductName,
  removeRanges,
} from './lineHeuristics';

export type NameSource = 'same-line' | 'previous-line' | 'next-line' | 'none';
export type NameConfidence = 'high' | 'medium' | 'low';

export interface ItemNameMatch {
  name: string;
  source: NameSource;
  confidence: NameConfidence;
  warnings: string[];
}

interface NearbyName {
  name: string;
  source: Exclude<NameSource, 'same-line' | 'none'>;
  distance: number;
}

function nearbyName(
  lines: string[],
  candidates: JanCandidate[],
  lineIndex: number,
  direction: -1 | 1,
  distance: number,
): NearbyName | null {
  const index = lineIndex + direction * distance;
  const line = lines[index];
  if (!line) return null;

  // 別商品のJAN行を商品名として採用しない。
  if (candidates.some((candidate) => candidate.lineIndex === index)) {
    return null;
  }

  const name = cleanProductName(line);
  if (!isLikelyProductName(name)) return null;

  return {
    name,
    source: direction === -1 ? 'previous-line' : 'next-line',
    distance,
  };
}

/**
 * OCR行の並びと近接関係だけを使うMVPの対応付け。
 * 同一行 → 直前1行 → 直後1行 → 2行離れた行、の順で候補を探す。
 * 不確実な場合は warnings に理由を残し、勝手に確定しない。
 */
export function matchItemNames(
  lines: string[],
  candidates: JanCandidate[],
): ItemNameMatch[] {
  return candidates.map((candidate) => {
    const line = lines[candidate.lineIndex] ?? '';
    const rangesOnLine = candidates
      .filter((other) => other.lineIndex === candidate.lineIndex)
      .map((other) => ({ start: other.start, end: other.end }));

    const sameLineName = cleanProductName(removeRanges(line, rangesOnLine));
    if (isLikelyProductName(sameLineName)) {
      return {
        name: sameLineName,
        source: 'same-line',
        confidence: 'high',
        warnings: [],
      };
    }

    const previousOne = nearbyName(
      lines,
      candidates,
      candidate.lineIndex,
      -1,
      1,
    );
    const nextOne = nearbyName(lines, candidates, candidate.lineIndex, 1, 1);

    if (previousOne && nextOne) {
      return {
        name: previousOne.name,
        source: previousOne.source,
        confidence: 'low',
        warnings: [
          '前後の行に商品名候補があります。商品との対応を確認してください。',
        ],
      };
    }

    const immediate = previousOne ?? nextOne;
    if (immediate) {
      return {
        name: immediate.name,
        source: immediate.source,
        confidence: 'medium',
        warnings: [],
      };
    }

    const previousTwo = nearbyName(
      lines,
      candidates,
      candidate.lineIndex,
      -1,
      2,
    );
    const nextTwo = nearbyName(lines, candidates, candidate.lineIndex, 1, 2);
    const distant = previousTwo ?? nextTwo;

    if (distant) {
      return {
        name: distant.name,
        source: distant.source,
        confidence: 'low',
        warnings: [
          '商品名は近接行から推定しました。商品との対応を確認してください。',
        ],
      };
    }

    return {
      name: '',
      source: 'none',
      confidence: 'low',
      warnings: [
        '商品名を推定できませんでした。必要に応じて商品名を入力してください。',
      ],
    };
  });
}
