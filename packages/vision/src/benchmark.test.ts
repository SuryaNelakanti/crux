import {
  calculateBinaryMaskMetrics,
  calculateComponentRecall,
  rasterizePolygons,
} from './benchmark';

describe('benchmark helpers', () => {
  it('rasterizes polygons into binary masks', () => {
    const mask = rasterizePolygons(6, 6, [
      [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 4 },
        { x: 1, y: 4 },
      ],
    ]);

    const hits = mask.reduce((sum, value) => sum + value, 0);
    expect(hits).toBe(9);
    expect(mask[2 * 6 + 2]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it('calculates known binary mask metrics', () => {
    const predicted = new Uint8Array([1, 1, 0, 0]);
    const groundTruth = new Uint8Array([1, 0, 1, 0]);

    const metrics = calculateBinaryMaskMetrics(predicted, groundTruth);

    expect(metrics.truePositive).toBe(1);
    expect(metrics.falsePositive).toBe(1);
    expect(metrics.falseNegative).toBe(1);
    expect(metrics.iou).toBeCloseTo(1 / 3);
    expect(metrics.precision).toBeCloseTo(0.5);
    expect(metrics.recall).toBeCloseTo(0.5);
    expect(metrics.f1).toBeCloseTo(0.5);
  });

  it('calculates component recall from per-hold masks', () => {
    const predicted = new Uint8Array([1, 1, 0, 0, 1, 0]);
    const components = [new Uint8Array([1, 1, 0, 0, 0, 0]), new Uint8Array([0, 0, 0, 0, 1, 1])];

    expect(calculateComponentRecall({ predicted, components })).toBe(1);
    expect(calculateComponentRecall({ predicted, components, minOverlapRatio: 0.75 })).toBe(0.5);
  });
});
