import { detectHolds } from './holds';
import { detectHoldsContrast } from './holds/contrast';

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

describe('detectHoldsContrast', () => {
  it('detects pastel holds on a mildly textured wall', () => {
    const width = 72;
    const height = 48;
    const pixels = fillImage(width, height, [126, 122, 114]);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const noise = ((x * 7 + y * 11) % 13) - 6;
        pixels[offset] = 126 + noise;
        pixels[offset + 1] = 122 + Math.round(noise * 0.7);
        pixels[offset + 2] = 114 + Math.round(noise * 0.5);
      }
    }

    paintRect(pixels, width, 14, 10, 9, 7, [238, 184, 201]);
    paintRect(pixels, width, 36, 22, 10, 8, [242, 190, 206]);
    paintRect(pixels, width, 54, 13, 8, 7, [235, 178, 198]);

    const result = detectHoldsContrast({ pixels, width, height });

    expect(result.holds.length).toBeGreaterThanOrEqual(3);
    expect(result.holds.some((hold) => hold.avgColor.s > 35)).toBe(true);
    expect(result.labels.some((value) => value >= 0)).toBe(true);
  });

  it('uses border evidence to avoid treating a central colored route as wall', () => {
    const width = 80;
    const height = 54;
    const pixels = fillImage(width, height, [118, 116, 108]);

    paintRect(pixels, width, 18, 12, 12, 9, [58, 118, 230]);
    paintRect(pixels, width, 38, 24, 12, 9, [64, 126, 236]);
    paintRect(pixels, width, 58, 34, 10, 8, [58, 118, 230]);
    paintRect(pixels, width, 0, 0, 8, 54, [162, 88, 48]);

    const result = detectHoldsContrast({ pixels, width, height });
    const blueHolds = result.holds.filter((hold) => hold.avgColor.h > 190 && hold.avgColor.h < 230);

    expect(blueHolds.length).toBeGreaterThanOrEqual(3);
    expect(result.wallColor.s).toBeLessThan(40);
  });
});
