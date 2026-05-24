export interface Point {
  x: number;
  y: number;
}

export type Polygon = Point[];

export interface BinaryMaskMetrics {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  iou: number;
  precision: number;
  recall: number;
  f1: number;
}

const safeDivide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

export function rasterizePolygons(width: number, height: number, polygons: Polygon[]): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    let minX = width - 1;
    let minY = height - 1;
    let maxX = 0;
    let maxY = 0;
    for (const point of polygon) {
      minX = Math.min(minX, Math.floor(point.x));
      minY = Math.min(minY, Math.floor(point.y));
      maxX = Math.max(maxX, Math.ceil(point.x));
      maxY = Math.max(maxY, Math.ceil(point.y));
    }

    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    maxX = Math.min(width - 1, maxX);
    maxY = Math.min(height - 1, maxY);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (isPointInPolygon(x + 0.5, y + 0.5, polygon)) {
          mask[y * width + x] = 1;
        }
      }
    }
  }
  return mask;
}

export function scalePolygon(polygon: Polygon, scaleX: number, scaleY: number): Polygon {
  return polygon.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
}

export function unionMasks(masks: Uint8Array[], size?: number): Uint8Array {
  const length = size ?? masks[0]?.length ?? 0;
  const result = new Uint8Array(length);
  for (const mask of masks) {
    for (let i = 0; i < Math.min(length, mask.length); i += 1) {
      if (mask[i]) result[i] = 1;
    }
  }
  return result;
}

export function calculateBinaryMaskMetrics(
  predicted: Uint8Array,
  groundTruth: Uint8Array
): BinaryMaskMetrics {
  const length = Math.min(predicted.length, groundTruth.length);
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (let i = 0; i < length; i += 1) {
    const p = predicted[i] > 0;
    const g = groundTruth[i] > 0;
    if (p && g) truePositive += 1;
    else if (p && !g) falsePositive += 1;
    else if (!p && g) falseNegative += 1;
    else trueNegative += 1;
  }

  const precision = safeDivide(truePositive, truePositive + falsePositive);
  const recall = safeDivide(truePositive, truePositive + falseNegative);
  const f1 = safeDivide(2 * precision * recall, precision + recall);
  const iou = safeDivide(truePositive, truePositive + falsePositive + falseNegative);

  return {
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    iou,
    precision,
    recall,
    f1,
  };
}

export function calculateComponentRecall(params: {
  predicted: Uint8Array;
  components: Uint8Array[];
  minOverlapRatio?: number;
}): number {
  const threshold = params.minOverlapRatio ?? 0.5;
  if (params.components.length === 0) return 0;
  let matched = 0;
  for (const component of params.components) {
    let area = 0;
    let overlap = 0;
    for (let i = 0; i < Math.min(component.length, params.predicted.length); i += 1) {
      if (!component[i]) continue;
      area += 1;
      if (params.predicted[i]) overlap += 1;
    }
    if (area > 0 && overlap / area >= threshold) matched += 1;
  }
  return matched / params.components.length;
}

export function bestMaskIoU(predictedMasks: Uint8Array[], groundTruthMasks: Uint8Array[]): number {
  let best = 0;
  for (const predicted of predictedMasks) {
    for (const groundTruth of groundTruthMasks) {
      best = Math.max(best, calculateBinaryMaskMetrics(predicted, groundTruth).iou);
    }
  }
  return best;
}

export function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function isPointInPolygon(x: number, y: number, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
