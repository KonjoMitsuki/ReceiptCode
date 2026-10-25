import { describe, expect, it } from 'vitest';
import {
  parseTsv,
  reconstructLineText,
  type OcrBBox,
} from '../../src/lib/ocr';

function word(
  text: string,
  x0: number,
  x1: number,
  confidence = 90,
): { text: string; bbox: OcrBBox; confidence: number } {
  return {
    text,
    bbox: { x0, y0: 0, x1, y1: 20 },
    confidence,
  };
}

describe('reconstructLineText', () => {
  it('日本語とJANの数字の間に不要な空白を入れない', () => {
    expect(
      reconstructLineText([
        word('牛乳', 0, 40),
        word('1L', 45, 65),
      ]),
    ).toBe('牛乳1L');

    expect(
      reconstructLineText([
        word('4901234', 0, 70),
        word('567894', 70, 130),
      ]),
    ).toBe('4901234567894');
  });

  it('商品名と価格は離して1行に戻す', () => {
    expect(
      reconstructLineText([
        word('商品名', 0, 60),
        word('\\198', 130, 170),
      ]),
    ).toBe('商品名 \\198');
  });

  it('空の単語は無視する', () => {
    expect(
      reconstructLineText([word('牛乳', 0, 40), word(' ', 45, 50)]),
    ).toBe('牛乳');
  });
});

describe('parseTsv', () => {
  const header = [
    'level',
    'page_num',
    'block_num',
    'par_num',
    'line_num',
    'word_num',
    'left',
    'top',
    'width',
    'height',
    'conf',
    'text',
  ].join('\t');

  function row(
    line: number,
    wordNumber: number,
    left: number,
    top: number,
    width: number,
    text: string,
    confidence = 90,
  ): string {
    return [
      '5',
      '1',
      '1',
      '1',
      String(line),
      String(wordNumber),
      String(left),
      String(top),
      String(width),
      '20',
      String(confidence),
      text,
    ].join('\t');
  }

  it('同じ行の単語をまとめ、bboxとconfidenceを作る', () => {
    const tsv = [
      header,
      row(1, 1, 10, 100, 50, '牛乳'),
      row(1, 2, 65, 100, 20, '1L', 80),
      row(2, 1, 10, 140, 130, '4901234567894'),
    ].join('\n');

    const lines = parseTsv(tsv);

    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('牛乳1L');
    expect(lines[0].bbox).toEqual({
      x0: 10,
      y0: 100,
      x1: 85,
      y1: 120,
    });
    expect(lines[0].confidence).toBe(85);
    expect(lines[1].text).toBe('4901234567894');
  });

  it('TSVが空なら空配列を返す', () => {
    expect(parseTsv('')).toEqual([]);
    expect(parseTsv(header)).toEqual([]);
  });

  it('複数行をまたぐ罫線を行のbboxに含めない', () => {
    const tsv = [
      header,
      row(1, 1, 10, 80, 10, '|').replace('\t20\t90\t|', '\t180\t90\t|'),
      row(1, 2, 100, 140, 130, '4901234567894'),
    ].join('\n');
    expect(parseTsv(tsv)[0]).toMatchObject({
      text: '4901234567894',
      bbox: { x0: 100, y0: 140, x1: 230, y1: 160 },
    });
  });
});
