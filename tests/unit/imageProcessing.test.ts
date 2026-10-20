import { describe, expect, it } from 'vitest';
import {
  fitWithin,
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
