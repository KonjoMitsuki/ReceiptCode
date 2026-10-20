export type ImagePreparationErrorCode =
  | 'empty-file'
  | 'unsupported-type'
  | 'file-too-large'
  | 'decode-failed'
  | 'canvas-unavailable'
  | 'encode-failed';

export class ImagePreparationError extends Error {
  readonly code: ImagePreparationErrorCode;

  constructor(code: ImagePreparationErrorCode, message: string) {
    super(message);
    this.name = 'ImagePreparationError';
    this.code = code;
  }
}

export interface PreparedImage {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  fileName: string;
  warnings: string[];
}

export const MAX_INPUT_BYTES = 30 * 1024 * 1024;
/** 実機計測前の暫定値。OCR精度とメモリ使用量のバランスで調整する。 */
export const MAX_IMAGE_DIMENSION = 2400;

export function fitWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    throw new ImagePreparationError(
      'decode-failed',
      '画像のサイズを取得できませんでした。',
    );
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeWithImageElement(file: File): Promise<DecodedImage> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();

    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error('empty image');
    }

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new ImagePreparationError(
      'decode-failed',
      '画像を読み込めませんでした。JPEGまたはPNGの画像を選ぶか、スマートフォンで撮り直してください。',
    );
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // EXIFオプション非対応やデコード失敗時は img 要素で再試行する。
    }
  }

  return decodeWithImageElement(file);
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new ImagePreparationError(
              'encode-failed',
              '画像の変換に失敗しました。別の画像でお試しください。',
            ),
          );
      },
      'image/jpeg',
      0.92,
    );
  });
}

/**
 * ブラウザ内で画像をデコード・向き補正・縮小し、OCRへ渡すJPEGを作る。
 * 画像データは外部へ送信しない。
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size === 0) {
    throw new ImagePreparationError(
      'empty-file',
      '空のファイルです。別の画像を選んでください。',
    );
  }

  if (file.type && !file.type.startsWith('image/')) {
    throw new ImagePreparationError(
      'unsupported-type',
      '画像ファイルを選んでください（JPEG / PNG / WebP）。',
    );
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new ImagePreparationError(
      'file-too-large',
      '画像が大きすぎます。30MB以下の画像を選んでください。',
    );
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch (error) {
    if (error instanceof ImagePreparationError) throw error;
    throw new ImagePreparationError(
      'decode-failed',
      '画像を読み込めませんでした。JPEGまたはPNGの画像を選ぶか、撮り直してください。',
    );
  }

  try {
    const target = fitWithin(
      decoded.width,
      decoded.height,
      MAX_IMAGE_DIMENSION,
    );
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new ImagePreparationError(
        'canvas-unavailable',
        'このブラウザでは画像処理を利用できません。別のブラウザでお試しください。',
      );
    }

    // 透過PNGをOCRに渡すと背景が黒くなる場合があるため白で塗る。
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, target.width, target.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, target.width, target.height);

    const blob = await canvasToJpeg(canvas);
    const previewUrl = URL.createObjectURL(blob);

    canvas.width = 0;
    canvas.height = 0;

    const warnings: string[] = [];
    if (Math.min(decoded.width, decoded.height) < 900) {
      warnings.push(
        '画像が小さいため、文字が読み取れない場合があります。レシート全体が大きく写るよう撮影してください。',
      );
    }

    return {
      blob,
      previewUrl,
      width: target.width,
      height: target.height,
      fileName: file.name,
      warnings,
    };
  } finally {
    decoded.release();
  }
}

export function revokePreparedImage(image: PreparedImage | null): void {
  if (image) URL.revokeObjectURL(image.previewUrl);
}
