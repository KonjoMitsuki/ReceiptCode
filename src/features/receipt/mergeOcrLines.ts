import type { OcrBBox, OcrLine } from '../../lib/ocr';
import type { OcrTileTransform } from '../../lib/ocrTiles';

export interface OcrTileResult {
  index: number;
  sourceY: number;
  sourceHeight: number;
  transform: OcrTileTransform;
  lines: OcrLine[];
}

interface SourceLine extends OcrLine {
  tileIndex: number;
  edgeClipped: boolean;
}

interface Representation {
  text: string;
  bbox: OcrBBox;
  confidence: number;
  coverage: number;
  chars: number;
  childCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function centerY(line: { bbox: OcrBBox }): number {
  return (line.bbox.y0 + line.bbox.y1) / 2;
}

function heightOf(line: { bbox: OcrBBox }): number {
  return Math.max(1, line.bbox.y1 - line.bbox.y0);
}

function widthOf(line: { bbox: OcrBBox }): number {
  return Math.max(1, line.bbox.x1 - line.bbox.x0);
}

function unionBBox(lines: Array<{ bbox: OcrBBox }>): OcrBBox {
  return lines.reduce<OcrBBox>(
    (union, line) => ({
      x0: Math.min(union.x0, line.bbox.x0),
      y0: Math.min(union.y0, line.bbox.y0),
      x1: Math.max(union.x1, line.bbox.x1),
      y1: Math.max(union.y1, line.bbox.y1),
    }),
    {
      x0: Number.POSITIVE_INFINITY,
      y0: Number.POSITIVE_INFINITY,
      x1: Number.NEGATIVE_INFINITY,
      y1: Number.NEGATIVE_INFINITY,
    },
  );
}

function toSourceLine(
  line: OcrLine,
  tile: OcrTileResult,
): SourceLine {
  const { cropLeft, cropTop, paddingLeft, paddingTop, scale } =
    tile.transform;
  const convertX = (value: number): number =>
    cropLeft + (value - paddingLeft) / scale;
  const convertY = (value: number): number =>
    cropTop + (value - paddingTop) / scale;

  return {
    ...line,
    tileIndex: tile.index,
    edgeClipped:
      convertY(line.bbox.y0) <= tile.sourceY + 6 ||
      convertY(line.bbox.y1) >= tile.sourceY + tile.sourceHeight - 6,
    bbox: {
      x0: convertX(line.bbox.x0),
      y0: convertY(line.bbox.y0),
      x1: convertX(line.bbox.x1),
      y1: convertY(line.bbox.y1),
    },
  };
}

function charWidthOf(text: string, bbox: OcrBBox): number {
  return widthOf({ bbox }) / Math.max(1, [...text.replace(/\s/g, '')].length);
}

function joinRepresentationLines(lines: SourceLine[]): string {
  const sorted = [...lines].sort(
    (a, b) => a.bbox.x0 - b.bbox.x0,
  );
  if (sorted.length === 0) return '';

  let text = sorted[0].text.trim();
  let previous = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const currentText = current.text.trim();
    if (!currentText) continue;
    const gap = current.bbox.x0 - previous.bbox.x1;
    const charWidth = charWidthOf(previous.text, previous.bbox);
    if (gap <= charWidth * 0.6) text += currentText;
    else text += ` ${currentText}`;
    previous = current;
  }
  return text.replace(/\s+/g, ' ').trim();
}

function buildRepresentation(
  lines: SourceLine[],
  unionWidth: number,
): Representation {
  const bbox = unionBBox(lines);
  const widthSum = lines.reduce(
    (sum, line) => sum + widthOf({ bbox: line.bbox }),
    0,
  );
  const confidence =
    widthSum > 0
      ? lines.reduce(
          (sum, line) =>
            sum + line.confidence * widthOf({ bbox: line.bbox }),
          0,
        ) / widthSum
      : lines.reduce((sum, line) => sum + line.confidence, 0) /
        lines.length;
  const text = joinRepresentationLines(lines);

  return {
    text,
    bbox,
    confidence,
    coverage: Math.min(1, widthOf({ bbox }) / Math.max(1, unionWidth)),
    chars: text.replace(/\s/g, '').length,
    childCount: lines.length,
  };
}

function bestByConfidence<T extends { confidence: number }>(
  items: T[],
): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, item) =>
    item.confidence > best.confidence ? item : best,
  );
}

function cropTextToRange(
  part: Representation,
  minX: number,
  maxX: number,
): string {
  const chars = [...part.text];
  if (chars.length === 0) return '';
  const charWidth = widthOf({ bbox: part.bbox }) / chars.length;
  const start = clamp(
    Math.floor((minX - part.bbox.x0) / Math.max(1, charWidth)),
    0,
    chars.length,
  );
  const end = clamp(
    Math.ceil((maxX - part.bbox.x0) / Math.max(1, charWidth)),
    0,
    chars.length,
  );
  return chars.slice(start, end).join('').trim();
}

/**
 * 完全な行がどのタイルにもない場合に、左右の断片を座標順に合成する。
 * 重なり区間はconfidenceの高い断片を採用し、文字列の類似判定はしない。
 */
function composeRepresentations(
  reps: Representation[],
  unionWidth: number,
): Representation | null {
  const sorted = [...reps].sort(
    (a, b) => a.bbox.x0 - b.bbox.x0,
  );
  if (sorted.length === 0) return null;

  const parts: Representation[] = [];
  for (const rep of sorted) {
    const last = parts[parts.length - 1];
    if (!last) {
      parts.push(rep);
      continue;
    }

    if (rep.bbox.x0 >= last.bbox.x1 - 2) {
      parts.push(rep);
      continue;
    }

    if (rep.bbox.x0 <= last.bbox.x0) {
      if (
        rep.confidence >= last.confidence ||
        rep.bbox.x1 > last.bbox.x1
      ) {
        parts[parts.length - 1] = rep;
      }
      continue;
    }

    if (rep.confidence > last.confidence) {
      const leftText = cropTextToRange(last, last.bbox.x0, rep.bbox.x0);
      if (leftText) {
        parts[parts.length - 1] = {
          ...last,
          text: leftText,
          bbox: { ...last.bbox, x1: rep.bbox.x0 },
        };
      } else {
        parts.pop();
      }
      parts.push(rep);
    } else {
      const rightText = cropTextToRange(rep, last.bbox.x1, rep.bbox.x1);
      if (rightText) {
        parts.push({
          ...rep,
          text: rightText,
          bbox: { ...rep.bbox, x0: last.bbox.x1 },
        });
      }
    }
  }

  if (parts.length === 0) return null;

  let text = parts[0].text;
  let previous = parts[0];
  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index];
    const gap = part.bbox.x0 - previous.bbox.x1;
    const charWidth = charWidthOf(previous.text, previous.bbox);
    text += gap <= charWidth * 0.6 ? part.text : ` ${part.text}`;
    previous = part;
  }

  const bbox = unionBBox(parts);
  const widthSum = parts.reduce(
    (sum, part) => sum + widthOf({ bbox: part.bbox }),
    0,
  );
  const confidence =
    widthSum > 0
      ? parts.reduce(
          (sum, part) =>
            sum + part.confidence * widthOf({ bbox: part.bbox }),
          0,
        ) / widthSum
      : 0;
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  return {
    text: normalizedText,
    bbox,
    confidence,
    coverage: Math.min(1, widthOf({ bbox }) / Math.max(1, unionWidth)),
    chars: normalizedText.replace(/\s/g, '').length,
    childCount: parts.reduce((sum, part) => sum + part.childCount, 0),
  };
}

function clusterBands(
  lines: SourceLine[],
): SourceLine[][] {
  const sorted = [...lines].sort(
    (a, b) => centerY(a) - centerY(b),
  );
  const bands: SourceLine[][] = [];

  for (const line of sorted) {
    let placed = false;
    for (let index = bands.length - 1; index >= 0; index -= 1) {
      const band = bands[index];
      const bandCenter =
        band.reduce((sum, item) => sum + centerY(item), 0) / band.length;
      const bandHeight = Math.max(...band.map(heightOf));
      if (
        Math.abs(centerY(line) - bandCenter) <
        0.5 * Math.max(heightOf(line), bandHeight)
      ) {
        band.push(line);
        placed = true;
        break;
      }
    }
    if (!placed) bands.push([line]);
  }

  return bands;
}

function chooseBandText(
  lines: SourceLine[],
  unionWidth: number,
): string {
  // タイル端で切れた行は、影を文字として拾ってbboxが大きくなることがある。
  // 別タイルに完全に写った候補がある場合、その外接幅の計算にも混ぜない。
  const interior = lines.filter((line) => !line.edgeClipped);
  if (interior.length > 0 && interior.length < lines.length) {
    return chooseBandText(interior, widthOf({ bbox: unionBBox(interior) }));
  }
  const byTile = new Map<number, SourceLine[]>();
  for (const line of lines) {
    const group = byTile.get(line.tileIndex);
    if (group) group.push(line);
    else byTile.set(line.tileIndex, [line]);
  }

  const reps = [...byTile.values()]
    .map((group) => buildRepresentation(group, unionWidth))
    .filter((rep) => rep.text.length > 0);
  if (reps.length === 0) return '';

  const maxChars = Math.max(...reps.map((rep) => rep.chars));
  const complete = reps.filter(
    (rep) => rep.coverage >= 0.95 && rep.chars >= maxChars * 0.7,
  );
  if (complete.length > 0) {
    return bestByConfidence(complete)?.text ?? '';
  }

  const maxCoverage = Math.max(...reps.map((rep) => rep.coverage));
  const nearBest = reps.filter(
    (rep) => maxCoverage - rep.coverage <= 0.02,
  );
  const chosenByCoverage =
    bestByConfidence(nearBest) ??
    nearBest.reduce((best, rep) =>
      rep.childCount > best.childCount ? rep : best,
    );

  const composite = composeRepresentations(reps, unionWidth);
  if (composite && composite.coverage >= 0.9) {
    return composite.text;
  }

  // 合成しても行全体を覆えない場合は、最も広い行を採用する。
  // 欠落の可能性はあるが、断片を連結して文字を重複させるより安全。
  return chosenByCoverage.text;
}

/**
 * タイルごとのOCR行を元画像座標に戻し、重複行を統合して1つのテキストにする。
 */
export function mergeOcrLines(tiles: OcrTileResult[]): string {
  const sourceLines = tiles
    .flatMap((tile) =>
      tile.lines.map((line) => toSourceLine(line, tile)),
    )
    .filter(
      (line) =>
        line.text.trim().length > 0 &&
        line.bbox.x1 > line.bbox.x0 &&
        line.bbox.y1 > line.bbox.y0,
    );

  if (sourceLines.length === 0) return '';

  const bands = clusterBands(sourceLines);
  const texts: Array<{ text: string; center: number }> = [];

  for (const band of bands) {
    const bbox = unionBBox(band);
    const text = chooseBandText(band, widthOf({ bbox }));
    if (text) texts.push({ text, center: centerY({ bbox }) });
  }

  return texts
    .sort((a, b) => a.center - b.center)
    .map((item) => item.text)
    .join('\n');
}
