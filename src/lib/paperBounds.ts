export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PaperBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  usedFallback: boolean;
}

export interface ClippedEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  any: boolean;
}

const PAPER_EDGE_MIN_LUMINANCE = 135;
const EDGE_PAPER_RATIO = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function luminance(data: Uint8ClampedArray, index: number): number {
  return (
    0.299 * data[index] +
    0.587 * data[index + 1] +
    0.114 * data[index + 2]
  );
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = clamp(
    Math.floor((sorted.length - 1) * ratio),
    0,
    sorted.length - 1,
  );
  return sorted[index];
}

function longestPaperRun(
  brightness: number[],
  threshold: number,
): { start: number; end: number } | null {
  let bestStart = -1;
  let bestEnd = -1;
  let runStart = -1;

  for (let x = 0; x <= brightness.length; x += 1) {
    const isPaper = x < brightness.length && brightness[x] >= threshold;
    if (isPaper && runStart < 0) runStart = x;
    if (!isPaper && runStart >= 0) {
      if (bestStart < 0 || x - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = x;
      }
      runStart = -1;
    }
  }

  return bestStart >= 0 ? { start: bestStart, end: bestEnd } : null;
}

function detectBandBounds(
  image: PixelImage,
  yStart: number,
  yEnd: number,
): { left: number; right: number } | null {
  const { width } = image;
  const height = yEnd - yStart;
  if (width <= 0 || height <= 0) return null;

  const stepY = Math.max(1, Math.floor(height / 60));
  const brightness: number[] = [];

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = yStart; y < yEnd; y += stepY) {
      const index = (y * width + x) * 4;
      sum += luminance(image.data, index);
      count += 1;
    }
    brightness.push(count > 0 ? sum / count : 0);
  }

  const sorted = [...brightness].sort((a, b) => a - b);
  // 影の部分も紙として残すため、閾値は低めにする。
  // 紙が画面の半分未満でも境界を見つけられるよう、明るい側の分布を基準にする。
  const threshold = Math.max(20, percentile(sorted, 0.9) * 0.45);
  const run = longestPaperRun(brightness, threshold);
  if (!run) return null;

  const runWidth = run.end - run.start;
  if (runWidth < width * 0.35 || runWidth > width * 0.95) return null;

  const margin = clamp(Math.round(width * 0.06), 24, 120);
  const left = Math.max(0, run.start - margin);
  const right = Math.min(width, run.end + margin);

  // 紙が画像端に接している場合は、切り取らず全幅を使う。
  if (left <= width * 0.02 || right >= width * 0.98) return null;

  return { left, right };
}

/**
 * タイル内の紙の左右範囲を推定する。
 * 影を紙の外側と誤判定しないよう、帯ごとの外接範囲を広めに取る。
 */
export function detectPaperBounds(
  image: PixelImage,
  yStart: number,
  yEnd: number,
): PaperBounds {
  const top = clamp(Math.floor(yStart), 0, image.height);
  const bottom = clamp(Math.ceil(yEnd), top, image.height);
  const bandHeight = bottom - top;
  const bandCount = clamp(Math.round(bandHeight / 220), 3, 5);
  const bands: Array<{ left: number; right: number }> = [];
  let usedFallback = false;

  for (let index = 0; index < bandCount; index += 1) {
    const bandStart = top + Math.floor((bandHeight * index) / bandCount);
    const bandEnd = top + Math.floor((bandHeight * (index + 1)) / bandCount);
    const bounds = detectBandBounds(image, bandStart, bandEnd);
    if (bounds) bands.push(bounds);
    else usedFallback = true;
  }

  if (bands.length === 0) {
    return {
      left: 0,
      right: image.width,
      top,
      bottom,
      usedFallback: true,
    };
  }

  const left = Math.min(...bands.map((band) => band.left));
  const right = Math.max(...bands.map((band) => band.right));
  const leftVariation =
    Math.max(...bands.map((band) => band.left)) -
    Math.min(...bands.map((band) => band.left));
  const rightVariation =
    Math.max(...bands.map((band) => band.right)) -
    Math.min(...bands.map((band) => band.right));

  if (
    usedFallback ||
    right - left < image.width * 0.35 ||
    right - left > image.width * 0.95 ||
    leftVariation > image.width * 0.15 ||
    rightVariation > image.width * 0.15
  ) {
    return {
      left: 0,
      right: image.width,
      top,
      bottom,
      usedFallback: true,
    };
  }

  return { left, right, top, bottom, usedFallback: false };
}

function edgeIsPaper(
  image: PixelImage,
  getIndex: (offset: number) => number,
  length: number,
): boolean {
  const step = Math.max(1, Math.floor(length / 200));
  let paperCount = 0;
  let count = 0;

  for (let offset = 0; offset < length; offset += step) {
    const index = getIndex(offset);
    if (luminance(image.data, index) >= PAPER_EDGE_MIN_LUMINANCE) {
      paperCount += 1;
    }
    count += 1;
  }

  return count > 0 && paperCount / count >= EDGE_PAPER_RATIO;
}

/**
 * レシートの紙が写真の端に接しているかを判定する。
 * 端に接している場合、その外側の文字は原理的に復元できない。
 */
export function detectClippedEdges(image: PixelImage): ClippedEdges {
  const { width, height } = image;
  if (width <= 0 || height <= 0) {
    return {
      top: false,
      bottom: false,
      left: false,
      right: false,
      any: false,
    };
  }

  const top = edgeIsPaper(
    image,
    (x) => (0 * width + x) * 4,
    width,
  );
  const bottom = edgeIsPaper(
    image,
    (x) => ((height - 1) * width + x) * 4,
    width,
  );
  const left = edgeIsPaper(
    image,
    (y) => (y * width + 0) * 4,
    height,
  );
  const right = edgeIsPaper(
    image,
    (y) => (y * width + width - 1) * 4,
    height,
  );

  return {
    top,
    bottom,
    left,
    right,
    any: top || bottom || left || right,
  };
}
