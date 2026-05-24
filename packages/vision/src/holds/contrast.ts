/**
 * Contrast-based hold detection.
 *
 * This is intentionally non-ML and deterministic. It models the climbing wall
 * first, then detects compact regions that differ from that wall by color,
 * saturation, and local edge contrast.
 */

import {
  colorDistanceLab,
  colorDistanceRgb,
  type HSL,
  hslToRgb,
  type LAB,
  type RGB,
  rgbToHsl,
  rgbToLab,
} from '../color';
import { type ColorCluster, clusterColors } from '../mask';

const DEFAULT_K = 6;
const MAX_SAMPLE_PIXELS = 18000;
const MIN_COMPONENT_RATIO = 0.00028;
const MAX_COMPONENT_RATIO = 0.22;
const DEFAULT_LAB_THRESHOLD = 18;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const hslDistance = (a: HSL, b: HSL): number => {
  const rawHue = Math.abs(a.h - b.h);
  const hue = Math.min(rawHue, 360 - rawHue) / 180;
  const sat = (a.s - b.s) / 100;
  const light = (a.l - b.l) / 100;
  return Math.sqrt((hue * 1.25) ** 2 + (sat * 0.9) ** 2 + (light * 0.7) ** 2);
};

const getRgbAt = (pixels: Uint8ClampedArray, idx: number): RGB => ({
  r: pixels[idx],
  g: pixels[idx + 1],
  b: pixels[idx + 2],
});

const getPixelRgb = (pixels: Uint8ClampedArray, pixelIndex: number): RGB =>
  getRgbAt(pixels, pixelIndex * 4);

const sampleStep = (total: number): number => Math.max(1, Math.floor(total / MAX_SAMPLE_PIXELS));

export interface ContrastDetectionParams {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Optional user-specified wall color. If not provided, auto-detect. */
  wallColor?: HSL;
  /** LAB distance threshold. Lower is more aggressive. */
  threshold?: number;
}

export interface ContrastHoldCandidate {
  id: number;
  avgColor: HSL;
  area: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  score: number;
}

export interface ContrastDetectionResult {
  width: number;
  height: number;
  labels: Int32Array;
  holds: ContrastHoldCandidate[];
  wallColor: HSL;
  clusters: ColorCluster[];
}

function isBorderPixel(index: number, width: number, height: number): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  const insetX = Math.max(2, Math.floor(width * 0.06));
  const insetY = Math.max(2, Math.floor(height * 0.06));
  return x < insetX || x >= width - insetX || y < insetY || y >= height - insetY;
}

function nearestClusterIndex(color: HSL, clusters: ColorCluster[]): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < clusters.length; i += 1) {
    const distance = hslDistance(color, clusters[i].center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function detectWallColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): { wallColor: HSL; wallLab: LAB; clusters: ColorCluster[] } {
  const clusters = clusterColors(pixels, width, height, DEFAULT_K);
  if (clusters.length === 0) {
    const fallback = { h: 0, s: 0, l: 50 };
    return { wallColor: fallback, wallLab: rgbToLab(hslToRgb(fallback)), clusters: [] };
  }

  const total = width * height;
  const step = sampleStep(total);
  const borderHits = new Array<number>(clusters.length).fill(0);
  const allHits = new Array<number>(clusters.length).fill(0);

  for (let i = 0; i < total; i += step) {
    const rgb = getPixelRgb(pixels, i);
    const hsl = rgbToHsl(rgb);
    const clusterIndex = nearestClusterIndex(hsl, clusters);
    allHits[clusterIndex] += 1;
    if (isBorderPixel(i, width, height)) {
      borderHits[clusterIndex] += 1;
    }
  }

  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < clusters.length; i += 1) {
    const cluster = clusters[i];
    const borderShare =
      borderHits[i] /
      Math.max(
        1,
        borderHits.reduce((sum, count) => sum + count, 0)
      );
    const imageShare =
      allHits[i] /
      Math.max(
        1,
        allHits.reduce((sum, count) => sum + count, 0)
      );
    const neutralBonus = clamp((45 - cluster.avgSaturation) / 45, 0, 1);
    const hugePenalty = imageShare > 0.72 ? -0.2 : 0;
    const score = borderShare * 0.55 + imageShare * 0.3 + neutralBonus * 0.15 + hugePenalty;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  const wallColor = clusters[bestIndex].center;
  return { wallColor, wallLab: rgbToLab(hslToRgb(wallColor)), clusters };
}

function localEdgeScore(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  index: number
): number {
  const x = index % width;
  const y = Math.floor(index / width);
  const rgb = getPixelRgb(pixels, index);
  let sum = 0;
  let count = 0;
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    sum += colorDistanceRgb(rgb, getPixelRgb(pixels, ny * width + nx));
    count += 1;
  }
  return count ? sum / count : 0;
}

function shouldKeepPixel(params: {
  rgb: RGB;
  hsl: HSL;
  labDistance: number;
  edge: number;
  wallColor: HSL;
  threshold: number;
}): boolean {
  const { hsl, labDistance, edge, wallColor, threshold } = params;
  const hueDelta = hslDistance(hsl, wallColor);
  const saturationLift = hsl.s - wallColor.s;
  const dynamicThreshold =
    threshold +
    (hsl.l < 18 || hsl.l > 92 ? 8 : 0) -
    clamp(saturationLift / 5, 0, 8) -
    clamp(edge / 16, 0, 5);

  if (labDistance < dynamicThreshold) return false;
  if (hsl.s < 8 && labDistance < threshold + 12 && edge < 18) return false;
  if (hueDelta < 0.08 && labDistance < threshold + 10) return false;
  return true;
}

function closeSmallGaps(mask: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (mask[idx]) continue;
      const neighbors = mask[idx - 1] + mask[idx + 1] + mask[idx - width] + mask[idx + width];
      if (neighbors >= 3) result[idx] = 1;
    }
  }
  return result;
}

function removeIsolated(mask: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      const neighbors = mask[idx - 1] + mask[idx + 1] + mask[idx - width] + mask[idx + width];
      if (neighbors === 0) result[idx] = 0;
    }
  }
  return result;
}

export function detectHoldsContrast(params: ContrastDetectionParams): ContrastDetectionResult {
  const { pixels, width, height } = params;
  const total = width * height;
  const labels = new Int32Array(total);
  labels.fill(-1);

  if (total === 0) {
    return {
      width,
      height,
      labels,
      holds: [],
      wallColor: params.wallColor ?? { h: 0, s: 0, l: 50 },
      clusters: [],
    };
  }

  const detected = params.wallColor
    ? {
        wallColor: params.wallColor,
        wallLab: rgbToLab(hslToRgb(params.wallColor)),
        clusters: clusterColors(pixels, width, height, DEFAULT_K),
      }
    : detectWallColor(pixels, width, height);

  const wallColor = detected.wallColor;
  const wallLab = detected.wallLab;
  const clusters = detected.clusters;
  const threshold = params.threshold ?? DEFAULT_LAB_THRESHOLD;

  const binaryMask = new Uint8Array(total);
  const labDistances = new Float32Array(total);
  const edgeScores = new Float32Array(total);

  for (let i = 0; i < total; i += 1) {
    const rgb = getPixelRgb(pixels, i);
    const hsl = rgbToHsl(rgb);
    const dist = colorDistanceLab(rgbToLab(rgb), wallLab);
    const edge = localEdgeScore(pixels, width, height, i);
    labDistances[i] = dist;
    edgeScores[i] = edge;
    if (shouldKeepPixel({ rgb, hsl, labDistance: dist, edge, wallColor, threshold })) {
      binaryMask[i] = 1;
    }
  }

  const cleaned = closeSmallGaps(removeIsolated(binaryMask, width, height), width, height);
  const visited = new Uint8Array(total);
  const holds: ContrastHoldCandidate[] = [];
  const minArea = Math.max(18, Math.floor(total * MIN_COMPONENT_RATIO));
  const maxArea = Math.max(minArea + 1, Math.floor(total * MAX_COMPONENT_RATIO));
  const stack: number[] = [];
  const component: number[] = [];
  let holdId = 0;

  for (let i = 0; i < total; i += 1) {
    if (visited[i] || cleaned[i] === 0) continue;
    stack.length = 0;
    component.length = 0;
    stack.push(i);
    visited[i] = 1;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumDist = 0;
    let sumEdge = 0;

    while (stack.length) {
      const idx = stack.pop() ?? 0;
      component.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      const offset = idx * 4;
      sumR += pixels[offset];
      sumG += pixels[offset + 1];
      sumB += pixels[offset + 2];
      sumDist += labDistances[idx];
      sumEdge += edgeScores[idx];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (visited[nidx] || cleaned[nidx] === 0) continue;
        visited[nidx] = 1;
        stack.push(nidx);
      }
    }

    const area = component.length;
    if (area < minArea || area > maxArea) continue;

    const bboxWidth = maxX - minX + 1;
    const bboxHeight = maxY - minY + 1;
    const bboxArea = Math.max(1, bboxWidth * bboxHeight);
    const fill = area / bboxArea;
    const aspect = Math.min(bboxWidth, bboxHeight) / Math.max(bboxWidth, bboxHeight);
    if (fill < 0.16 && area < total * 0.008) continue;
    if (aspect < 0.08 && area < total * 0.025) continue;

    const avgRgb = {
      r: Math.round(sumR / area),
      g: Math.round(sumG / area),
      b: Math.round(sumB / area),
    };
    const avgColor = rgbToHsl(avgRgb);
    const contrastScore = clamp((sumDist / area - threshold) / 34, 0, 1);
    const edgeScore = clamp(sumEdge / area / 34, 0, 1);
    const areaScore = clamp(area / (total * 0.018), 0.25, 1);
    const shapeScore = clamp(fill * 0.7 + aspect * 0.3, 0, 1);
    const saturationScore = clamp((avgColor.s - Math.max(8, wallColor.s - 8)) / 55, 0, 1);
    const score =
      contrastScore * 0.38 +
      edgeScore * 0.22 +
      areaScore * 0.16 +
      shapeScore * 0.14 +
      saturationScore * 0.1;

    for (const idx of component) {
      labels[idx] = holdId;
    }

    holds.push({
      id: holdId,
      avgColor,
      area,
      bbox: { minX, minY, maxX, maxY },
      score,
    });

    holdId += 1;
  }

  return { width, height, labels, holds, wallColor, clusters };
}
