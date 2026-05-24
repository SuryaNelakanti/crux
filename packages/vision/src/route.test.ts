import { buildRouteMaskForGroup, generateRouteMask, groupHoldsByColor } from './route';

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
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number]
) => {
  const height = pixels.length / (width * 4);
  for (let yy = y; yy < Math.min(height, y + h); yy += 1) {
    for (let xx = x; xx < Math.min(width, x + w); xx += 1) {
      const offset = (yy * width + xx) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
};

describe('route grouping', () => {
  it('groups holds by perceptual color', () => {
    const groups = groupHoldsByColor([
      { id: 0, avgColor: { h: 210, s: 78, l: 56 }, area: 100, score: 0.8 },
      { id: 1, avgColor: { h: 214, s: 75, l: 55 }, area: 90, score: 0.7 },
      { id: 2, avgColor: { h: 24, s: 70, l: 50 }, area: 80, score: 0.6 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].holdIds).toEqual([0, 1]);
  });

  it('builds a route mask from selected hold ids', () => {
    const labels = new Int32Array([0, 0, -1, 1, 2, 2]);
    const mask = buildRouteMaskForGroup({ width: 3, height: 2, labels }, { holdIds: [0, 2] });

    expect([...mask]).toEqual([1, 1, 0, 0, 1, 1]);
  });

  it('selects the seeded route group when a seed point lands on a hold', () => {
    const width = 64;
    const height = 44;
    const pixels = fillImage(width, height, [122, 119, 111]);
    paintRect(pixels, width, 8, 8, 8, 7, [230, 70, 60]);
    paintRect(pixels, width, 24, 18, 8, 7, [226, 68, 62]);
    paintRect(pixels, width, 44, 26, 8, 7, [60, 120, 230]);

    const result = generateRouteMask({
      pixels,
      width,
      height,
      seedPoint: { x: 46, y: 28 },
    });

    expect(result.fallback).toBe(false);
    expect(result.method).toBe('seed-color');
    expect(result.seedColor.h).toBeGreaterThan(190);
    expect(result.seedColor.h).toBeLessThan(230);
  });
});
