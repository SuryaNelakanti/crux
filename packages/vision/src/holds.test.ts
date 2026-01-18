import { detectHolds } from './holds';

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

describe('detectHolds', () => {
  it('detects multiple hold candidates from saturated regions', () => {
    const width = 48;
    const height = 32;
    const pixels = fillImage(width, height, [120, 120, 120]);
    paintRect(pixels, width, 6, 6, 10, 8, [220, 60, 60]);
    paintRect(pixels, width, 28, 10, 10, 8, [240, 200, 40]);

    const result = detectHolds({ pixels, width, height });
    expect(result.holds.length).toBeGreaterThanOrEqual(2);
    expect(result.labels.some((value) => value >= 0)).toBe(true);
  });
});
