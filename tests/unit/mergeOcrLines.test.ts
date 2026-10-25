import { describe, expect, it } from 'vitest';
import type { OcrLine } from '../../src/lib/ocr';
import {
  mergeOcrLines,
  type OcrTileResult,
} from '../../src/features/receipt/mergeOcrLines';
import { parseReceipt } from '../../src/features/receipt/receiptParser';

interface LineSpec {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence?: number;
}

function line(spec: LineSpec): OcrLine {
  return {
    text: spec.text,
    bbox: {
      x0: spec.x0,
      y0: spec.y0,
      x1: spec.x1,
      y1: spec.y1,
    },
    confidence: spec.confidence ?? 90,
  };
}

function tile(
  index: number,
  sourceY: number,
  lines: LineSpec[],
  sourceHeight = 1200,
): OcrTileResult {
  return {
    index,
    sourceY,
    sourceHeight,
    transform: {
      cropLeft: 0,
      cropTop: sourceY,
      paddingLeft: 0,
      paddingTop: 0,
      scale: 1,
    },
    lines: lines.map((spec) =>
      line({
        ...spec,
        y0: spec.y0 - sourceY,
        y1: spec.y1 - sourceY,
      }),
    ),
  };
}

describe('mergeOcrLines', () => {
  it('広く誤認したタイル端の行より、内側に完全に写った行を優先する', () => {
    const text = mergeOcrLines([
      tile(0, 0, [{
        text: 'タイル端の長い誤認断片', x0: 0, x1: 400,
        y0: 1170, y1: 1200, confidence: 99,
      }]),
      tile(1, 960, [{
        text: '醤油 \\100外', x0: 100, x1: 300,
        y0: 1170, y1: 1200, confidence: 75,
      }]),
    ]);
    expect(text).toBe('醤油 \\100外');
  });

  it('他タイルに候補がない端の行は失わない', () => {
    const text = mergeOcrLines([
      tile(0, 0, [{
        text: '画像の先頭の商品', x0: 10, x1: 200,
        y0: 0, y1: 20,
      }]),
    ]);
    expect(text).toBe('画像の先頭の商品');
  });

  it('オーバーラップした同じ物理行を1行に統合する', () => {
    const text = mergeOcrLines([
      tile(0, 0, [
        { text: '牛乳 1L \\198', x0: 20, y0: 1000, x1: 300, y1: 1020 },
      ]),
      tile(1, 800, [
        { text: '牛乳 1L \\198', x0: 20, y0: 1000, x1: 300, y1: 1020 },
      ]),
    ]);

    expect(text).toBe('牛乳 1L \\198');
  });

  it('完全な行を、端だけの高confidence断片より優先する', () => {
    const text = mergeOcrLines([
      tile(0, 0, [
        {
          text: '牛乳 1L \\198',
          x0: 20,
          y0: 1000,
          x1: 300,
          y1: 1020,
          confidence: 70,
        },
      ]),
      tile(1, 800, [
        {
          text: '牛乳',
          x0: 20,
          y0: 1000,
          x1: 80,
          y1: 1020,
          confidence: 99,
        },
      ]),
    ]);

    expect(text).toBe('牛乳 1L \\198');
  });

  it('同じ行の商品名と価格を横に結合する', () => {
    const text = mergeOcrLines([
      tile(0, 0, [
        { text: '牛乳 1L', x0: 20, y0: 1000, x1: 100, y1: 1020 },
        { text: '\\198', x0: 200, y0: 1000, x1: 260, y1: 1020 },
      ]),
    ]);

    expect(text).toBe('牛乳 1L \\198');
  });

  it('左右に分かれた断片を座標順に合成する', () => {
    const text = mergeOcrLines([
      tile(0, 0, [
        {
          text: 'ステンレスキッチン',
          x0: 20,
          y0: 1000,
          x1: 150,
          y1: 1020,
        },
      ]),
      tile(1, 800, [
        {
          text: 'トレー \\198',
          x0: 150,
          y0: 1000,
          x1: 300,
          y1: 1020,
        },
      ]),
    ]);

    expect(text).toBe('ステンレスキッチントレー \\198');
  });

  it('別のYにある同じ商品名は別の行として残す', () => {
    const text = mergeOcrLines([
      tile(0, 0, [
        { text: '牛乳', x0: 20, y0: 1000, x1: 100, y1: 1020 },
        { text: '牛乳', x0: 20, y0: 1200, x1: 100, y1: 1220 },
      ]),
    ]);

    expect(text.split('\n')).toEqual(['牛乳', '牛乳']);
  });

  it('統合テキストをパースして商品名とJANを対応させる', () => {
    const text = mergeOcrLines([
      tile(0, 0, [
        {
          text: '牛乳 1L \\198',
          x0: 20,
          y0: 100,
          x1: 300,
          y1: 120,
        },
        {
          text: '4901234567894',
          x0: 20,
          y0: 140,
          x1: 200,
          y1: 160,
        },
        {
          text: '食パン 8枚切 \\298',
          x0: 20,
          y0: 800,
          x1: 320,
          y1: 820,
        },
        {
          text: '4512345678906',
          x0: 20,
          y0: 840,
          x1: 200,
          y1: 860,
        },
      ]),
    ]);

    const parsed = parseReceipt(text);

    expect(parsed.items.map((item) => item.name)).toEqual([
      '牛乳 1L',
      '食パン 8枚切',
    ]);
    expect(parsed.items.map((item) => item.jan)).toEqual([
      '4901234567894',
      '4512345678906',
    ]);
    expect(
      parsed.items.some((item) =>
        item.warnings.join(' ').includes('前後の行'),
      ),
    ).toBe(false);
  });
});
