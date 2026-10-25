import { describe, expect, it } from 'vitest';
import {
  detectClippedEdges,
  detectPaperBounds,
  type PixelImage,
} from '../../src/lib/paperBounds';

function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number,
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const value = pixel(x, y);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('detectPaperBounds', () => {
  it('暗い背景と影の中の紙を広めに切り出す', () => {
    const image = makeImage(300, 300, (x) =>
      x >= 60 && x < 240 ? 200 : x >= 45 && x < 60 ? 60 : 20,
    );

    const bounds = detectPaperBounds(image, 0, 300);

    expect(bounds.usedFallback).toBe(false);
    expect(bounds.left).toBeLessThanOrEqual(60);
    expect(bounds.right).toBeGreaterThanOrEqual(240);
  });

  it('傾いた紙は帯ごとの外接範囲を含める', () => {
    const image = makeImage(300, 300, (x, y) => {
      const left = 90 - Math.floor(y / 20);
      const right = 210 + Math.floor(y / 20);
      return x >= left && x < right ? 210 : 15;
    });

    const bounds = detectPaperBounds(image, 0, 300);

    expect(bounds.usedFallback).toBe(false);
    expect(bounds.left).toBeLessThanOrEqual(75);
    expect(bounds.right).toBeGreaterThanOrEqual(225);
  });

  it('紙が極端に細い場合は全幅にフォールバックする', () => {
    const image = makeImage(100, 100, (x) =>
      x >= 45 && x < 55 ? 220 : 10,
    );

    const bounds = detectPaperBounds(image, 0, 100);

    expect(bounds.usedFallback).toBe(true);
    expect(bounds.left).toBe(0);
    expect(bounds.right).toBe(100);
  });

  it('紙が画像端に接する場合は全幅にフォールバックする', () => {
    const image = makeImage(100, 100, (x) =>
      x < 80 ? 220 : 10,
    );

    const bounds = detectPaperBounds(image, 0, 100);

    expect(bounds.usedFallback).toBe(true);
    expect(bounds.left).toBe(0);
    expect(bounds.right).toBe(100);
  });

  it('境界が分からない暗い画像は全幅にフォールバックする', () => {
    const image = makeImage(100, 100, () => 10);

    const bounds = detectPaperBounds(image, 0, 100);

    expect(bounds.usedFallback).toBe(true);
    expect(bounds.left).toBe(0);
    expect(bounds.right).toBe(100);
  });
});

describe('detectClippedEdges', () => {
  it('紙が上端と下端に接していることを検出する', () => {
    const image = makeImage(100, 100, () => 220);

    const edges = detectClippedEdges(image);

    expect(edges).toMatchObject({
      top: true,
      bottom: true,
      left: true,
      right: true,
      any: true,
    });
  });

  it('暗い背景だけの画像では端切れを検出しない', () => {
    const image = makeImage(100, 100, () => 15);

    const edges = detectClippedEdges(image);

    expect(edges.any).toBe(false);
  });
});
