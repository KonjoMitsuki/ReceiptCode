import { describe, expect, it } from 'vitest';
import {
  fitWithin,
  fitWithinPixels,
  ImagePreparationError,
} from '../../src/lib/imageProcessing';

describe('fitWithin', () => {
  it('長辺を最大値に合わせて縦横比を保つ', () => {
    expect(fitWithin(4000, 3000, 2400)).toEqual({
      width: 2400,
      height: 1800,
    });
    expect(fitWithin(3000, 4000, 2400)).toEqual({
      width: 1800,
      height: 2400,
    });
  });

  it('最大値以下なら拡大しない', () => {
    expect(fitWithin(1000, 800, 2400)).toEqual({
      width: 1000,
      height: 800,
    });
  });

  it('極端に細い画像でも最低1pxを確保する', () => {
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });

  it('不正なサイズは例外にする', () => {
    expect(() => fitWithin(0, 100, 2400)).toThrow(ImagePreparationError);
    expect(() => fitWithin(100, -1, 2400)).toThrow(ImagePreparationError);
  });
});

describe('fitWithinPixels', () => {
  it('24.5MPの画像を約12MPに縮小する', () => {
    expect(fitWithinPixels(4284, 5712, 12_000_000, 4000)).toEqual({
      width: 3000,
      height: 4000,
    });
  });

  it('画素数の上限が長辺より先に効く場合は画素数を優先する', () => {
    expect(fitWithinPixels(5000, 5000, 12_000_000, 4000)).toEqual({
      width: 3464,
      height: 3464,
    });
  });

  it('小さい画像は拡大しない', () => {
    expect(fitWithinPixels(2000, 1500, 12_000_000, 4000)).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it('不正なサイズは例外にする', () => {
    expect(() =>
      fitWithinPixels(0, 100, 12_000_000, 4000),
    ).toThrow(ImagePreparationError);
  });
});
