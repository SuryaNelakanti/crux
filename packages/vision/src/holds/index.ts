/**
 * Hold detection via color clustering + connected components.
 * Pure, deterministic, no platform dependencies.
 */

import { type HSL, type RGB, rgbToHsl } from '../color';
import { type ColorCluster, clusterColors } from '../mask';

const DEFAULT_K = 6;
const MIN_CLUSTER_SCORE = 0.06;
const MIN_COMPONENT_RATIO = 0.0005;
const MAX_COMPONENT_RATIO = 0.12;

const hslDistance = (a: HSL, b: HSL): number => {
  const rawHue = Math.abs(a.h - b.h);
  const hue = Math.min(rawHue, 360 - rawHue) / 180;
  const sat = (a.s - b.s) / 100;
  const light = (a.l - b.l) / 100;
  return Math.sqrt(hue * hue + sat * sat + light * light);
};

const getRgbAt = (pixels: Uint8ClampedArray, idx: number): RGB => ({
  r: pixels[idx],
  g: pixels[idx + 1],
  b: pixels[idx + 2],
});

export interface HoldCandidate {
  id: number;
  clusterIndex: number;
  center: HSL;
  avgColor: HSL;
  area: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  score: number;
}

export interface HoldDetectionResult {
  width: number;
  height: number;
  labels: Int32Array;
  holds: HoldCandidate[];
  clusters: ColorCluster[];
}

export function detectHolds(params: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  k?: number;
}): HoldDetectionResult {
  const { pixels, width, height } = params;
  const total = width * height;
  const labels = new Int32Array(total);
  labels.fill(-1);

  if (total === 0) {
    return { width, height, labels, holds: [], clusters: [] };
  }

  const clusters = clusterColors(pixels, width, height, params.k ?? DEFAULT_K);
  if (clusters.length === 0) {
    return { width, height, labels, holds: [], clusters };
  }

  const candidates = clusters
    .map((cluster, index) => ({ cluster, index }))
    .filter(({ cluster }) => cluster.score >= MIN_CLUSTER_SCORE || cluster.avgSaturation > 18);

  if (candidates.length === 0) {
    return { width, height, labels, holds: [], clusters };
  }

  const candidateCenters = candidates.map((entry) => entry.cluster.center);
  const candidateIndices = candidates.map((entry) => entry.index);
  const pixelCluster = new Int16Array(total);
  pixelCluster.fill(-1);

  for (let i = 0; i < total; i += 1) {
    const offset = i * 4;
    const rgb = getRgbAt(pixels, offset);
    const hsl = rgbToHsl(rgb);
    if (hsl.s < 6 && hsl.l < 90) continue;
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let c = 0; c < candidateCenters.length; c += 1) {
      const dist = hslDistance(hsl, candidateCenters[c]);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = c;
      }
    }
    if (bestIndex === -1) continue;
    if (bestDistance > 0.38) continue;
    pixelCluster[i] = candidateIndices[bestIndex];
  }

  const visited = new Uint8Array(total);
  const holds: HoldCandidate[] = [];
  const minArea = Math.max(40, Math.floor(total * MIN_COMPONENT_RATIO));
  const maxArea = Math.floor(total * MAX_COMPONENT_RATIO);

  let holdId = 0;
  const stack: number[] = [];
  const component: number[] = [];

  for (let i = 0; i < total; i += 1) {
    if (visited[i] || pixelCluster[i] < 0) continue;
    const clusterIndex = pixelCluster[i];
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
    let sampleCount = 0;

    while (stack.length) {
      const idx = stack.pop() ?? 0;
      component.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      const pixelOffset = idx * 4;
      sumR += pixels[pixelOffset];
      sumG += pixels[pixelOffset + 1];
      sumB += pixels[pixelOffset + 2];
      sampleCount += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const nidx of neighbors) {
        if (nidx < 0 || nidx >= total) continue;
        if (visited[nidx]) continue;
        if (pixelCluster[nidx] !== clusterIndex) continue;
        visited[nidx] = 1;
        stack.push(nidx);
      }
    }

    const area = component.length;
    if (area < minArea || area > maxArea) {
      continue;
    }

    const bboxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    const compactness = Math.min(1, area / bboxArea);
    const cluster = clusters[clusterIndex];
    const score = cluster.score * compactness;
    const avgColor = rgbToHsl({
      r: sampleCount ? Math.round(sumR / sampleCount) : 0,
      g: sampleCount ? Math.round(sumG / sampleCount) : 0,
      b: sampleCount ? Math.round(sumB / sampleCount) : 0,
    });

    for (const idx of component) {
      labels[idx] = holdId;
    }

    holds.push({
      id: holdId,
      clusterIndex,
      center: cluster.center,
      avgColor,
      area,
      bbox: { minX, minY, maxX, maxY },
      score,
    });

    holdId += 1;
  }

  return { width, height, labels, holds, clusters };
}
