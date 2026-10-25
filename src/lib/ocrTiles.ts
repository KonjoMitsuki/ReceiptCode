import { MAX_IMAGE_DIMENSION } from './imageProcessing';
import { detectPaperBounds, type PixelImage } from './paperBounds';

export const OCR_TILE_HEIGHT = 1200;
export const OCR_TILE_OVERLAP = 240;
export const MAX_OCR_TILES = 5;
export const OCR_TILE_PADDING = 44;

export interface OcrTilePlan {
  index: number;
  total: number;
  sourceY: number;
  sourceHeight: number;
}

export interface OcrTileTransform {
  cropLeft: number;
  cropTop: number;
  paddingLeft: number;
  paddingTop: number;
  scale: number;
}

export interface OcrTile {
  blob: Blob;
  index: number;
  total: number;
  sourceY: number;
  sourceHeight: number;
  transform: OcrTileTransform;
}

export interface TilePreprocessOptions {
  contrast?: number;
  brightness?: number;
  sharpen?: number;
}

export class OcrTileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrTileError';
  }
}

export function shouldUseTiledOcr(width: number, height: number): boolean {
  return width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;
}

export function planOcrTiles(
  width: number,
  height: number,
): OcrTilePlan[] {
  if (width <= 0 || height <= 0) {
    throw new OcrTileError('タイル分割の画像サイズが不正です。');
  }

  let tileHeight = Math.min(OCR_TILE_HEIGHT, height);
  if (height <= tileHeight + OCR_TILE_OVERLAP) {
    return [
      {
        index: 0,
        total: 1,
        sourceY: 0,
        sourceHeight: height,
      },
    ];
  }

  let stride = Math.max(1, tileHeight - OCR_TILE_OVERLAP);
  let count =
    Math.ceil((height - tileHeight) / stride) + 1;

  if (count > MAX_OCR_TILES) {
    tileHeight = Math.min(
      height,
      Math.ceil(
        (height + (MAX_OCR_TILES - 1) * OCR_TILE_OVERLAP) /
          MAX_OCR_TILES,
      ),
    );
    stride = Math.max(1, tileHeight - OCR_TILE_OVERLAP);
    count = Math.ceil((height - tileHeight) / stride) + 1;
  }

  count = Math.min(count, MAX_OCR_TILES);
  const starts: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.min(
      height - tileHeight,
      index * stride,
    );
    if (starts.length === 0 || start > starts[starts.length - 1]) {
      starts.push(start);
    }
  }

  // 端数で最後のタイルが届かない場合に備え、末尾を必ず含める。
  const lastStart = height - tileHeight;
  if (starts[starts.length - 1] < lastStart) {
    starts.push(lastStart);
  }

  return starts.slice(0, MAX_OCR_TILES).map((sourceY, index) => ({
    index,
    total: Math.min(starts.length, MAX_OCR_TILES),
    sourceY,
    sourceHeight: tileHeight,
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 大きなぼかしで紙の明るさを推定し、影の勾配を取り除く。 */
export function normalizeIllumination(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 48,
): void {
  if (width < 3 || height < 3) return;
  const horizontal = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    let right = -1;
    let left = 0;
    for (let x = 0; x < width; x += 1) {
      const end = Math.min(width - 1, x + radius);
      while (right < end) sum += gray[row + ++right];
      const start = Math.max(0, x - radius);
      while (left < start) sum -= gray[row + left++];
      horizontal[row + x] = sum / (right - left + 1);
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let bottom = -1;
    let top = 0;
    for (let y = 0; y < height; y += 1) {
      const end = Math.min(height - 1, y + radius);
      while (bottom < end) sum += horizontal[++bottom * width + x];
      const start = Math.max(0, y - radius);
      while (top < start) sum -= horizontal[top++ * width + x];
      const background = sum / (bottom - top + 1);
      const pixel = y * width + x;
      gray[pixel] = (gray[pixel] / Math.max(32, background)) * 245;
    }
  }
}

/**
 * タイル画像の文字を読みやすくする。
 * 強い2値化はせず、グレースケール・軽いコントラスト補正・弱い輪郭強調に留める。
 */
export function preprocessTilePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: TilePreprocessOptions = {},
): void {
  const contrast = options.contrast ?? 1.35;
  const brightness = options.brightness ?? 8;
  const sharpen = options.sharpen ?? 0.35;
  const pixelCount = width * height;
  const gray = new Uint8ClampedArray(pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    gray[pixel] =
      0.299 * data[index] +
      0.587 * data[index + 1] +
      0.114 * data[index + 2];
  }

  normalizeIllumination(gray, width, height);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    gray[pixel] = (gray[pixel] - 128) * contrast + 128 + brightness;
  }

  if (sharpen > 0 && width >= 3 && height >= 3) {
    const source = gray.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const blurred =
          (source[pixel - 1] +
            source[pixel + 1] +
            source[pixel - width] +
            source[pixel + width]) /
          4;
        gray[pixel] = source[pixel] + sharpen * (source[pixel] - blurred);
      }
    }
  }

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const value = gray[pixel];
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new OcrTileError('タイル画像の変換に失敗しました。'));
      },
      'image/jpeg',
      0.92,
    );
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('OCR tile generation aborted', 'AbortError');
  }
}

/**
 * 高解像度画像を1枚ずつタイル化する。
 * タイル生成とOCRを交互に行い、全タイルのCanvasを同時に保持しない。
 */
export async function* createOcrTiles(
  ocrBlob: Blob,
  signal: AbortSignal,
): AsyncGenerator<OcrTile> {
  if (typeof createImageBitmap !== 'function') {
    throw new OcrTileError('このブラウザでは分割読み取りを利用できません。');
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(ocrBlob);
    throwIfAborted(signal);

    const plans = planOcrTiles(bitmap.width, bitmap.height);
    for (const plan of plans) {
      throwIfAborted(signal);

      const bandCanvas = document.createElement('canvas');
      bandCanvas.width = bitmap.width;
      bandCanvas.height = plan.sourceHeight;
      const bandContext = bandCanvas.getContext('2d', {
        willReadFrequently: true,
      });
      if (!bandContext) {
        throw new OcrTileError('タイル画像の処理を開始できませんでした。');
      }

      bandContext.drawImage(
        bitmap,
        0,
        plan.sourceY,
        bitmap.width,
        plan.sourceHeight,
        0,
        0,
        bitmap.width,
        plan.sourceHeight,
      );
      const pixels = bandContext.getImageData(
        0,
        0,
        bitmap.width,
        plan.sourceHeight,
      ) as PixelImage;
      const bounds = detectPaperBounds(
        pixels,
        0,
        plan.sourceHeight,
      );
      bandCanvas.width = 0;
      bandCanvas.height = 0;


      throwIfAborted(signal);

      const cropLeft = clamp(
        Math.round(bounds.left),
        0,
        bitmap.width - 1,
      );
      const cropRight = clamp(
        Math.round(bounds.right),
        cropLeft + 1,
        bitmap.width,
      );
      const cropWidth = cropRight - cropLeft;
      const scale =
        cropWidth < 1400
          ? Math.min(1.5, 1400 / Math.max(1, cropWidth))
          : 1;
      const drawWidth = Math.max(1, Math.round(cropWidth * scale));
      const drawHeight = Math.max(
        1,
        Math.round(plan.sourceHeight * scale),
      );

      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = drawWidth + OCR_TILE_PADDING * 2;
      tileCanvas.height = drawHeight + OCR_TILE_PADDING * 2;
      const tileContext = tileCanvas.getContext('2d', {
        willReadFrequently: true,
      });
      if (!tileContext) {
        throw new OcrTileError('タイル画像の処理を開始できませんでした。');
      }

      tileContext.fillStyle = '#ffffff';
      tileContext.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
      tileContext.imageSmoothingEnabled = true;
      tileContext.imageSmoothingQuality = 'high';
      tileContext.drawImage(
        bitmap,
        cropLeft,
        plan.sourceY,
        cropWidth,
        plan.sourceHeight,
        OCR_TILE_PADDING,
        OCR_TILE_PADDING,
        drawWidth,
        drawHeight,
      );

      const tilePixels = tileContext.getImageData(
        0,
        0,
        tileCanvas.width,
        tileCanvas.height,
      );
      preprocessTilePixels(
        tilePixels.data,
        tileCanvas.width,
        tileCanvas.height,
      );
      tileContext.putImageData(tilePixels, 0, 0);

      const blob = await canvasToJpeg(tileCanvas);
      tileCanvas.width = 0;
      tileCanvas.height = 0;


      yield {
        blob,
        index: plan.index,
        total: plan.total,
        sourceY: plan.sourceY,
        sourceHeight: plan.sourceHeight,
        transform: {
          cropLeft,
          cropTop: plan.sourceY,
          paddingLeft: OCR_TILE_PADDING,
          paddingTop: OCR_TILE_PADDING,
          scale,
        },
      };
    }
  } finally {
    bitmap?.close();
  }
}
