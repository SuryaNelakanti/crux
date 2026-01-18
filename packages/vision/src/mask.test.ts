import { generateMask } from './mask';

const fillImage = (
  width: number,
  height: number,
  color: [number, number, number]
): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  }
  return pixels;
};

const paintRect = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number]
) => {
  const maxX = Math.min(width, x + w);
  const maxY = Math.min(height, y + h);
  for (let yy = y; yy < maxY; yy += 1) {
    for (let xx = x; xx < maxX; xx += 1) {
      const offset = (yy * width + xx) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
};

const countMask = (mask: Uint8Array): number => {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) count += 1;
  }
  return count;
};

describe('generateMask', () => {
  it('selects a saturated cluster for auto masking', () => {
    const width = 24;
    const height = 16;
    const pixels = fillImage(width, height, [120, 120, 120]);
    paintRect(pixels, width, height, 6, 4, 8, 6, [230, 60, 60]);

    const result = generateMask({ pixels, width, height });
    const hits = countMask(result.mask);
    const coverage = hits / (width * height);

    expect(result.method).toBe('auto');
    expect(coverage).toBeGreaterThan(0.05);
    expect(coverage).toBeLessThan(0.5);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('uses seed color when provided', () => {
    const width = 20;
    const height = 20;
    const pixels = fillImage(width, height, [110, 110, 110]);
    paintRect(pixels, width, height, 4, 4, 6, 6, [40, 120, 230]);

    const result = generateMask({
      pixels,
      width,
      height,
      seedColor: { h: 210, s: 70, l: 55 },
    });

    const hits = countMask(result.mask);
    expect(result.method).toBe('seed-color');
    expect(hits).toBeGreaterThan(0);
  });
});
