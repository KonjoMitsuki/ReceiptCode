import { describe, expect, it } from 'vitest';
import {
  BarcodeRenderError,
  renderBarcodeSvg,
} from '../../src/lib/barcode';

function createSvg(): SVGSVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

describe('renderBarcodeSvg', () => {
  it('有効なEAN-13をSVGとして描画する', () => {
    const svg = createSvg();
    const result = renderBarcodeSvg(svg, '4901234567894');

    expect(result.format).toBe('EAN13');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(svg.getAttribute('viewBox')).toBe(
      `0 0 ${result.width} ${result.height}`,
    );
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('4901234567894');
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(20);
  });

  it('有効なEAN-8をSVGとして描画する', () => {
    const svg = createSvg();
    const result = renderBarcodeSvg(svg, '12345670');
    expect(result.format).toBe('EAN8');
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(10);
  });

  it('先頭ゼロを落とさずに描画する', () => {
    const svg = createSvg();
    renderBarcodeSvg(svg, '0123456789012');
    expect(svg.getAttribute('aria-label')).toContain('0123456789012');
  });

  it('チェックデジット不正は描画せず例外にする', () => {
    const svg = createSvg();
    expect(() => renderBarcodeSvg(svg, '4901234567890')).toThrow(
      BarcodeRenderError,
    );
    expect(svg.childNodes).toHaveLength(0);
  });

  it('桁数不正・数字以外は描画しない', () => {
    const svg = createSvg();
    expect(() => renderBarcodeSvg(svg, '1234567')).toThrow(BarcodeRenderError);
    expect(() => renderBarcodeSvg(svg, '49012345678A4')).toThrow(
      BarcodeRenderError,
    );
    expect(svg.childNodes).toHaveLength(0);
  });
});
