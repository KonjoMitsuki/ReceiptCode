import { describe, expect, it } from 'vitest';
import {
  OCR_TILE_HEIGHT,
  OCR_TILE_OVERLAP,
  normalizeIllumination,
  planOcrTiles,
  preprocessTilePixels,
  shouldUseTiledOcr,
} from '../../src/lib/ocrTiles';

describe('shouldUseTiledOcr', () => {
  it('2400px以下は従来の一括処理を使う', () => {
    expect(shouldUseTiledOcr(2000, 2000)).toBe(false);
    expect(shouldUseTiledOcr(2400, 2400)).toBe(false);
  });

  it('どちらかが2400pxを超えたら分割処理を使う', () => {
    expect(shouldUseTiledOcr(2400, 2401)).toBe(true);
    expect(shouldUseTiledOcr(3000, 2000)).toBe(true);
    expect(shouldUseTiledOcr(3000, 4000)).toBe(true);
  });
});

describe('planOcrTiles', () => {
  it('3000×4000を1200px高・240px重なりで4枚に分ける', () => {
    const tiles = planOcrTiles(3000, 4000);

    expect(tiles).toHaveLength(4);
    expect(tiles.map((tile) => tile.sourceY)).toEqual([
      0, 960, 1920, 2800,
    ]);
    expect(tiles.every((tile) => tile.sourceHeight === OCR_TILE_HEIGHT)).toBe(
      true,
    );
    expect(tiles.map((tile) => tile.total)).toEqual([4, 4, 4, 4]);
  });

  it('3000×2000を2枚に分ける', () => {
    const tiles = planOcrTiles(3000, 2000);

    expect(tiles.map((tile) => tile.sourceY)).toEqual([0, 800]);
    expect(tiles).toHaveLength(2);
  });

  it('高さ1200px以下は1枚にする', () => {
    expect(planOcrTiles(3000, 1200)).toEqual([
      { index: 0, total: 1, sourceY: 0, sourceHeight: 1200 },
    ]);
    expect(planOcrTiles(3000, 1000)).toEqual([
      { index: 0, total: 1, sourceY: 0, sourceHeight: 1000 },
    ]);
  });

  it('全タイルが隙間なく末尾まで覆う', () => {
    for (const height of [2000, 2401, 4000, 5712, 10000]) {
      const tiles = planOcrTiles(3000, height);
      expect(tiles[0].sourceY).toBe(0);
      expect(tiles[tiles.length - 1].sourceY + tiles[tiles.length - 1].sourceHeight)
        .toBe(height);
      for (let index = 1; index < tiles.length; index += 1) {
        const previous = tiles[index - 1];
        const current = tiles[index];
        expect(current.sourceY).toBeLessThanOrEqual(
          previous.sourceY + previous.sourceHeight,
        );
        expect(
          previous.sourceY + previous.sourceHeight - current.sourceY,
        ).toBeGreaterThanOrEqual(Math.min(OCR_TILE_OVERLAP, current.sourceY));
      }
    }
  });

  it('タイル数を5枚以下に抑える', () => {
    const tiles = planOcrTiles(3000, 20000);
    expect(tiles.length).toBeLessThanOrEqual(5);
    expect(tiles[tiles.length - 1].sourceY + tiles[tiles.length - 1].sourceHeight)
      .toBe(20000);
  });
});

describe('preprocessTilePixels', () => {
  it('色をグレースケールにし、コントラストを付ける', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);

    preprocessTilePixels(data, 2, 2, {
      contrast: 1.2,
      brightness: 0,
      sharpen: 0,
    });

    for (let pixel = 0; pixel < 4; pixel += 1) {
      const index = pixel * 4;
      expect(data[index]).toBe(data[index + 1]);
      expect(data[index]).toBe(data[index + 2]);
      expect(data[index + 3]).toBe(255);
    }
    expect(data[0]).toBeLessThan(data[12]);
  });
});

describe('normalizeIllumination', () => {
  it('影の勾配を均し、細い文字のコントラストを残す', () => {
    const width = 240;
    const height = 80;
    const gray = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const background = 70 + x * 0.6;
        gray[y * width + x] = y === 40 ? background * 0.55 : background;
      }
    }
    normalizeIllumination(gray, width, height, 12);
    expect(Math.abs(gray[20 * width + 40] - gray[20 * width + 200]))
      .toBeLessThan(10);
    expect(gray[40 * width + 40]).toBeLessThan(gray[20 * width + 40] - 70);
    expect(gray[40 * width + 200]).toBeLessThan(gray[20 * width + 200] - 70);
  });

  it('極小画像を変更しない', () => {
    const gray = new Uint8ClampedArray([20, 40, 60, 80]);
    normalizeIllumination(gray, 2, 2);
    expect([...gray]).toEqual([20, 40, 60, 80]);
  });
});
