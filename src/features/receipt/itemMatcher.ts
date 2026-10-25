import type { JanCandidate } from './receiptParser';
import {
  cleanProductName,
  isLikelyProductName,
  isNamePriceLine,
  removeRanges,
} from './lineHeuristics';

export type NameSource = 'same-line' | 'previous-line' | 'next-line' | 'none';
export type NameConfidence = 'high' | 'medium' | 'low';

/**
 * レシートの商品名とJANの並び方。
 * - jan-below-name: 「商品名＋価格」の直下にJANがある形式
 * - generic: 上下どちらにも商品名があり得る形式（従来の近傍行ヒューリスティック）
 */
export type ReceiptLayout = 'jan-below-name' | 'generic';

export interface MatchItemNamesOptions {
  layout?: ReceiptLayout;
}

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

/** 空白行を飛ばして、直近の非空行を返す。 */
function previousNonEmptyLine(
  lines: string[],
  lineIndex: number,
): { line: string; index: number } | null {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line?.trim()) return { line, index };
  }
  return null;
}

/**
 * OCR行の並びと近接関係だけを使うMVPの対応付け。
 * 同一行 → 直前1行 → 直後1行 → 2行離れた行、の順で候補を探す。
 * 不確実な場合は warnings に理由を残し、勝手に確定しない。
 */
export function matchItemNames(
  lines: string[],
  candidates: JanCandidate[],
  options: MatchItemNamesOptions = {},
): ItemNameMatch[] {
  return candidates.map((candidate) => {
    const line = lines[candidate.lineIndex] ?? '';
    const rangesOnLine = candidates
      .filter((other) => other.lineIndex === candidate.lineIndex)
      .map((other) => ({ start: other.start, end: other.end }));

    const sameLineName = cleanProductName(removeRanges(line, rangesOnLine));
    const previous = previousNonEmptyLine(lines, candidate.lineIndex);
    // 商品名＋価格の直下にJANがある形式では、JAN行のOCRノイズより
    // 価格付きの直上行を優先する。同一行に価格もある混在形式は保持する。
    const preferPrevious = options.layout === 'jan-below-name' &&
      previous !== null && isNamePriceLine(previous.line) && !isNamePriceLine(line);
    if (!preferPrevious && isLikelyProductName(sameLineName)) {
      return {
        name: sameLineName,
        source: 'same-line',
        confidence: 'high',
        warnings: [],
      };
    }

    // 「商品名＋価格」の直下にJANがあるレシートでは、直上の商品名だけを採用する。
    // 次の商品名まで候補にすると、すべてのJANが「前後の行に商品名がある」と
    // 誤判定されてしまうため。
    if (options.layout === 'jan-below-name') {
      const previousHasJan =
        previous !== null &&
        candidates.some((other) => other.lineIndex === previous.index);

      if (previous && !previousHasJan) {
        const name = cleanProductName(previous.line);
        if (isLikelyProductName(name)) {
          return {
            name,
            source: 'previous-line',
            confidence: isNamePriceLine(previous.line) ? 'high' : 'medium',
            warnings: [],
          };
        }
      }

      return {
        name: '',
        source: 'none',
        confidence: 'low',
        warnings: [
          'JANの直上に商品名がありません。商品との対応を確認してください。',
        ],
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
