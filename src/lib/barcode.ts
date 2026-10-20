import JsBarcode from 'jsbarcode';
import { formatForLength, validateJan } from './jan';
import type { JanFormat } from '../types/receipt';

export class BarcodeRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BarcodeRenderError';
  }
}

export interface BarcodeRenderResult {
  format: JanFormat;
  width: number;
  height: number;
}

function invalidMessage(jan: string): string {
  const validation = validateJan(jan);

  switch (validation.reason) {
    case 'invalid-length':
      return 'JANは8桁または13桁で入力してください。';
    case 'invalid-characters':
      return 'JANは半角数字だけで入力してください。';
    case 'invalid-check-digit':
      return `チェックデジットが一致しません（期待値 ${validation.expectedCheckDigit} / 末尾 ${validation.actualCheckDigit}）。番号を修正してください。`;
    default:
      return '有効なJANではありません。';
  }
}

/**
 * 検証済みのJANだけをSVGバーコードにする。
 * 失敗時は空のSVGを残さず、呼び出し側が理由を表示できるよう例外を投げる。
 */
export function renderBarcodeSvg(
  svg: SVGSVGElement,
  jan: string,
): BarcodeRenderResult {
  const validation = validateJan(jan);
  if (!validation.valid || !validation.format) {
    svg.replaceChildren();
    throw new BarcodeRenderError(invalidMessage(jan));
  }

  svg.replaceChildren();

  try {
    JsBarcode(svg, jan, {
      format: validation.format,
      width: 2,
      height: 120,
      // 24単位 = バー幅2単位の12モジュール。左右のQuiet Zoneを確保する。
      margin: 24,
      displayValue: false,
      background: '#ffffff',
      lineColor: '#000000',
      flat: false,
    });
  } catch {
    svg.replaceChildren();
    throw new BarcodeRenderError(
      'バーコードを描画できませんでした。JANの桁数と数字を確認してください。',
    );
  }

  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  const safeWidth = Number.isFinite(width) ? width : 0;
  const safeHeight = Number.isFinite(height) ? height : 0;

  if (safeWidth <= 0 || safeHeight <= 0) {
    svg.replaceChildren();
    throw new BarcodeRenderError(
      'バーコードのサイズを取得できませんでした。もう一度お試しください。',
    );
  }

  const format = formatForLength(jan.length);
  if (!format) {
    svg.replaceChildren();
    throw new BarcodeRenderError('JANの形式を判定できませんでした。');
  }

  svg.setAttribute('viewBox', `0 0 ${safeWidth} ${safeHeight}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${format} バーコード ${jan}`);

  return { format, width: safeWidth, height: safeHeight };
}
