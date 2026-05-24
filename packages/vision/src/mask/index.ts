/**
 * Mask generation pipeline
 *
 * Implements dominant-hold-color masking with clustering + cleanup.
 *
 * All functions are pure and deterministic.
 * Takes pixel data, returns mask data.
 */

import { type HSL, hslToRgb, type LAB, type RGB, rgbToHsl, rgbToLab } from '../color';

const DEFAULT_K = 5;
const MAX_SAMPLE_PIXELS = 15000;
const KMEANS_ITERS = 6;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const HUE_WEIGHT = 1.15;
const SAT_WEIGHT = 0.75;
const LIGHT_WEIGHT = 0.55;

const hslDistance = (a: HSL, b: HSL): number => {
  const rawHue = Math.abs(a.h - b.h);
  const hue = Math.min(rawHue, 360 - rawHue) / 180; // 0..1
  const sat = (a.s - b.s) / 100;
  const light = (a.l - b.l) / 100;
  return Math.sqrt((hue * HUE_WEIGHT) ** 2 + (sat * SAT_WEIGHT) ** 2 + (light * LIGHT_WEIGHT) ** 2);
};

const labDistance = (a: LAB, b: LAB): number =>
  Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);

const getRgbAt = (pixels: Uint8ClampedArray, idx: number): RGB => ({
  r: pixels[idx],
  g: pixels[idx + 1],
  b: pixels[idx + 2],
});

const sampleSeedLab = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seedPoint: { x: number; y: number },
  window: number = 2
): LAB => {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  const startX = Math.max(0, seedPoint.x - window);
  const endX = Math.min(width - 1, seedPoint.x + window);
  const startY = Math.max(0, seedPoint.y - window);
  const endY = Math.min(height - 1, seedPoint.y + window);
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const offset = (y * width + x) * 4;
      sumR += pixels[offset];
      sumG += pixels[offset + 1];
      sumB += pixels[offset + 2];
      count += 1;
    }
  }
  const rgb: RGB = {
    r: count ? Math.round(sumR / count) : pixels[(seedPoint.y * width + seedPoint.x) * 4],
    g: count ? Math.round(sumG / count) : pixels[(seedPoint.y * width + seedPoint.x) * 4 + 1],
    b: count ? Math.round(sumB / count) : pixels[(seedPoint.y * width + seedPoint.x) * 4 + 2],
  };
  return rgbToLab(rgb);
};

const clampPoint = (
  point: { x: number; y: number },
  width: number,
  height: number
): { x: number; y: number } => ({
  x: Math.min(width - 1, Math.max(0, Math.round(point.x))),
  y: Math.min(height - 1, Math.max(0, Math.round(point.y))),
});

const toHueVector = (h: number): { sin: number; cos: number } => {
  const rad = (h * Math.PI) / 180;
  return { sin: Math.sin(rad), cos: Math.cos(rad) };
};

const averageHue = (sumSin: number, sumCos: number): number => {
  if (sumSin === 0 && sumCos === 0) return 0;
  let deg = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return Math.round(deg);
};

const samplePixels = (pixels: Uint8ClampedArray, width: number, height: number): HSL[] => {
  const total = width * height;
  if (total === 0) return [];
  const target = Math.min(total, MAX_SAMPLE_PIXELS);
  const step = Math.max(1, Math.floor(total / target));
  const samples: HSL[] = [];
  for (let i = 0; i < total; i += step) {
    const offset = i * 4;
    const a = pixels[offset + 3];
    if (a !== undefined && a < 20) continue;
    const rgb: RGB = {
      r: pixels[offset],
      g: pixels[offset + 1],
      b: pixels[offset + 2],
    };
    samples.push(rgbToHsl(rgb));
  }
  return samples;
};

const initCenters = (samples: HSL[], k: number): HSL[] => {
  if (samples.length === 0) return [];
  const centers: HSL[] = [];
  const stride = Math.max(1, Math.floor(samples.length / k));
  for (let i = 0; i < k; i += 1) {
    centers.push(samples[(i * stride) % samples.length]);
  }
  return centers;
};

// ============================================================================
// Types
// ============================================================================

export interface MaskGenerationInput {
  /** Image pixel data (RGBA, row-major) */
  pixels: Uint8ClampedArray;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Optional seed color (from user tap) */
  seedColor?: HSL;
  /** Optional seed point (pixel coordinates matching the input size) */
  seedPoint?: { x: number; y: number };
}

export interface ColorCluster {
  /** Cluster center in HSL */
  center: HSL;
  /** Number of pixels in cluster */
  count: number;
  /** Average saturation */
  avgSaturation: number;
  /** Confidence score (0-1) */
  score: number;
}

export interface MaskGenerationResult {
  /** Binary mask (1 = hold, 0 = background) */
  mask: Uint8Array;
  /** Detected seed color */
  seedColor: HSL;
  /** Confidence score (0-1) */
  confidence: number;
  /** Method used */
  method: 'auto' | 'seed-color';
  /** Color clusters found */
  clusters: ColorCluster[];
}

const buildSeededMask = (params: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  seedPoint: { x: number; y: number };
  seedLab: LAB;
  seedHsl: HSL;
  hslThreshold: number;
  labThreshold: number;
  saturationFloor: number;
  wallClusterCenter?: HSL;
  maxRadius: number;
}): Uint8Array => {
  const {
    pixels,
    width,
    height,
    seedPoint,
    seedLab,
    seedHsl,
    hslThreshold,
    labThreshold,
    saturationFloor,
    wallClusterCenter,
    maxRadius,
  } = params;
  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(mask.length);
  const stack: number[] = [];
  const seedIdx = seedPoint.y * width + seedPoint.x;
  stack.push(seedIdx);
  visited[seedIdx] = 1;
  mask[seedIdx] = 1;
  const maxRadiusSq = maxRadius * maxRadius;

  while (stack.length) {
    const idx = stack.pop() ?? 0;
    const x = idx % width;
    const y = Math.floor(idx / width);
    const dx = x - seedPoint.x;
    const dy = y - seedPoint.y;
    if (dx * dx + dy * dy > maxRadiusSq) continue;
    const offset = idx * 4;
    const rgb = getRgbAt(pixels, offset);
    const hsl = rgbToHsl(rgb);
    if (saturationFloor && hsl.s < saturationFloor) continue;
    if (
      wallClusterCenter &&
      hslDistance(hsl, wallClusterCenter) < hslDistance(hsl, seedHsl) * 0.9
    ) {
      continue;
    }
    const lab = rgbToLab(rgb);
    const labDist = labDistance(lab, seedLab);
    const hslDist = hslDistance(hsl, seedHsl);
    if (labDist <= labThreshold && hslDist <= hslThreshold) {
      mask[idx] = 1;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (visited[nidx]) continue;
        visited[nidx] = 1;
        stack.push(nidx);
      }
    }
  }

  return mask;
};

const countMask = (mask: Uint8Array): number => {
  let hits = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) hits += 1;
  }
  return hits;
};

// ============================================================================
// Pipeline Functions (Stubs)
// ============================================================================

/**
 * Generate mask from image data
 *
 * Pipeline:
 * 1. Downsample if needed
 * 2. Cluster colors (K-means in HSL/LAB space)
 * 3. Score clusters for "hold-likeness"
 * 4. Select dominant cluster
 * 5. Create binary mask
 * 6. Morphology cleanup
 * 7. Calculate confidence
 */
export function generateMask(input: MaskGenerationInput): MaskGenerationResult {
  const { width, height, seedColor, seedPoint } = input;
  const mask = new Uint8Array(width * height);

  if (width === 0 || height === 0) {
    return {
      mask,
      seedColor: seedColor ?? { h: 0, s: 0, l: 50 },
      confidence: 0,
      method: seedColor ? 'seed-color' : 'auto',
      clusters: [],
    };
  }

  const clusters = clusterColors(input.pixels, width, height, DEFAULT_K);

  const method: MaskGenerationResult['method'] = seedColor ? 'seed-color' : 'auto';
  let selectedSeed = seedColor ?? clusters[0]?.center ?? { h: 0, s: 0, l: 50 };
  let selectedClusterIndex = clusters.length ? 0 : -1;

  if (seedColor && clusters.length > 0) {
    let closestIndex = 0;
    let closestDistance = Infinity;
    for (let i = 0; i < clusters.length; i += 1) {
      const distance = hslDistance(clusters[i].center, seedColor);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }
    selectedClusterIndex = closestIndex;
    selectedSeed = clusters[closestIndex]?.center ?? selectedSeed;
  }

  const threshold = (() => {
    if (clusters.length < 2) {
      return seedColor ? 0.26 : 0.2;
    }
    const distances = clusters
      .map((cluster, index) =>
        index === selectedClusterIndex ? null : hslDistance(cluster.center, selectedSeed)
      )
      .filter((value): value is number => value !== null);
    const nearest = distances.length ? Math.min(...distances) : seedColor ? 0.26 : 0.2;
    const multiplier = seedColor ? 0.62 : 0.45;
    const min = seedColor ? 0.12 : 0.08;
    const max = seedColor ? 0.3 : 0.22;
    return clamp(nearest * multiplier, min, max);
  })();

  const saturationFloor =
    seedColor && seedColor.s > 35 ? Math.min(22, Math.round(seedColor.s - 35)) : 0;

  const wallCluster = clusters
    .filter((cluster) => cluster.avgSaturation < 20)
    .sort((a, b) => b.count - a.count)[0];

  const useSeedGrow = Boolean(seedColor && seedPoint);

  if (useSeedGrow && seedPoint) {
    const clampedSeed = clampPoint(seedPoint, width, height);
    const seedLab =
      seedPoint !== undefined
        ? sampleSeedLab(input.pixels, width, height, clampedSeed, 2)
        : rgbToLab(hslToRgb(selectedSeed));
    const seedHsl = seedColor ?? selectedSeed;

    const hueBoost =
      (seedHsl.h >= 35 && seedHsl.h <= 90) || seedHsl.h >= 300 || seedHsl.h <= 20 ? 4 : 0;
    const pastelBoost = seedHsl.s < 35 ? 8 : 0;
    const lightBoost = seedHsl.l > 70 ? 6 : 0;
    const baseLab = 18 + pastelBoost + lightBoost + hueBoost;
    const baseHsl = threshold * (seedHsl.s < 30 ? 1.25 : 1.1);

    const maxRadius = Math.max(width, height) * 0.45;
    let seededMask = buildSeededMask({
      pixels: input.pixels,
      width,
      height,
      seedPoint: clampedSeed,
      seedLab,
      seedHsl,
      hslThreshold: baseHsl,
      labThreshold: baseLab,
      saturationFloor,
      wallClusterCenter: wallCluster?.center,
      maxRadius,
    });

    const total = width * height;
    const coverage = total ? countMask(seededMask) / total : 0;
    const minCoverage = 0.003;
    const maxCoverage = 0.45;
    if (coverage < minCoverage || coverage > maxCoverage) {
      const scale = coverage < minCoverage ? 1.25 : 0.85;
      seededMask = buildSeededMask({
        pixels: input.pixels,
        width,
        height,
        seedPoint: clampedSeed,
        seedLab,
        seedHsl,
        hslThreshold: baseHsl * scale,
        labThreshold: baseLab * scale,
        saturationFloor: coverage > maxCoverage ? saturationFloor + 6 : saturationFloor,
        wallClusterCenter: wallCluster?.center,
        maxRadius,
      });
    }

    for (let i = 0; i < mask.length; i += 1) {
      mask[i] = seededMask[i];
    }
  } else {
    for (let i = 0; i < width * height; i += 1) {
      const offset = i * 4;
      const rgb = getRgbAt(input.pixels, offset);
      const hsl = rgbToHsl(rgb);
      if (saturationFloor && hsl.s < saturationFloor) continue;
      const distance = hslDistance(hsl, selectedSeed);
      if (distance <= threshold) {
        mask[i] = 1;
      }
    }
  }

  const cleaned = cleanupMask(mask, width, height);
  const confidence = calculateConfidence(cleaned, clusters);

  return {
    mask: cleaned,
    seedColor: selectedSeed,
    confidence,
    method,
    clusters,
  };
}

/**
 * Cluster colors using K-means
 */
export function clusterColors(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  k: number = DEFAULT_K
): ColorCluster[] {
  const samples = samplePixels(pixels, width, height);
  if (samples.length === 0) return [];

  const centers = initCenters(samples, k);
  const counts = new Array<number>(centers.length).fill(0);
  const sumS = new Array<number>(centers.length).fill(0);
  const sumL = new Array<number>(centers.length).fill(0);
  const sumSin = new Array<number>(centers.length).fill(0);
  const sumCos = new Array<number>(centers.length).fill(0);

  for (let iter = 0; iter < KMEANS_ITERS; iter += 1) {
    counts.fill(0);
    sumS.fill(0);
    sumL.fill(0);
    sumSin.fill(0);
    sumCos.fill(0);

    for (const sample of samples) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < centers.length; i += 1) {
        const distance = hslDistance(sample, centers[i]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }
      counts[bestIndex] += 1;
      sumS[bestIndex] += sample.s;
      sumL[bestIndex] += sample.l;
      const hueVec = toHueVector(sample.h);
      sumSin[bestIndex] += hueVec.sin;
      sumCos[bestIndex] += hueVec.cos;
    }

    for (let i = 0; i < centers.length; i += 1) {
      if (counts[i] === 0) continue;
      centers[i] = {
        h: averageHue(sumSin[i], sumCos[i]),
        s: Math.round(sumS[i] / counts[i]),
        l: Math.round(sumL[i] / counts[i]),
      };
    }
  }

  const total = samples.length;
  const clusters: ColorCluster[] = centers.map((center, index) => ({
    center,
    count: counts[index],
    avgSaturation: counts[index] ? sumS[index] / counts[index] : 0,
    score: 0,
  }));

  for (const cluster of clusters) {
    cluster.score = scoreCluster(cluster, total);
  }

  return clusters.sort((a, b) => b.score - a.score);
}

/**
 * Score a cluster for "hold-likeness"
 *
 * Higher score = more likely to be holds
 * Considerations:
 * - High saturation (holds are usually colorful)
 * - Not too large (background) or too small (noise)
 * - Compact connected components
 */
export function scoreCluster(cluster: ColorCluster, totalCount: number = 1): number {
  if (totalCount <= 0) return 0;
  const ratio = cluster.count / totalCount;
  const saturationScore = clamp((cluster.avgSaturation - 15) / 65, 0, 1);
  if (ratio < 0.005 || ratio > 0.6) return 0;
  const sizeScore = clamp(1 - Math.abs(ratio - 0.12) / 0.35, 0, 1);
  return clamp(saturationScore * sizeScore, 0, 1);
}

/**
 * Apply morphological cleanup to mask
 *
 * - Opening (erosion then dilation) to remove noise
 * - Closing (dilation then erosion) to fill gaps
 * - Remove small connected components
 */
export function cleanupMask(mask: Uint8Array, _width: number, _height: number): Uint8Array {
  const opened = dilate(erode(mask, _width, _height), _width, _height);
  const closed = erode(dilate(opened, _width, _height), _width, _height);
  return removeSmallComponents(closed, _width, _height);
}

/**
 * Calculate confidence score for a generated mask
 *
 * Based on:
 * - Cluster separation (distinct colors)
 * - Connected component analysis
 * - Coverage ratio
 */
export function calculateConfidence(mask: Uint8Array, clusters: ColorCluster[]): number {
  if (mask.length === 0) return 0;
  const total = mask.length;
  let hits = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) hits += 1;
  }
  const coverage = hits / total;
  const coverageScore =
    coverage < 0.01 || coverage > 0.6 ? 0 : clamp(1 - Math.abs(coverage - 0.15) / 0.35, 0, 1);

  const sorted = [...clusters].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const scoreGap = sorted.length > 1 ? clamp(topScore - sorted[1].score, 0, 1) : 0;

  return clamp(topScore * 0.5 + scoreGap * 0.3 + coverageScore * 0.2, 0, 1);
}

function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            keep = 0;
            break;
          }
          if (mask[ny * width + nx] === 0) {
            keep = 0;
            break;
          }
        }
        if (!keep) break;
      }
      result[y * width + x] = keep;
    }
  }
  return result;
}

function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (mask[ny * width + nx] === 1) {
            on = 1;
            break;
          }
        }
        if (on) break;
      }
      result[y * width + x] = on;
    }
  }
  return result;
}

function removeSmallComponents(mask: Uint8Array, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(mask.length);
  const result = new Uint8Array(mask);
  const minSize = Math.max(24, Math.floor(width * height * 0.0008));

  const stack: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0 || visited[i] === 1) continue;
    stack.length = 0;
    stack.push(i);
    visited[i] = 1;
    const component: number[] = [i];

    while (stack.length) {
      const idx = stack.pop() ?? 0;
      const x = idx % width;
      const y = Math.floor(idx / width);
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (mask[nidx] === 1 && visited[nidx] === 0) {
          visited[nidx] = 1;
          stack.push(nidx);
          component.push(nidx);
        }
      }
    }

    if (component.length < minSize) {
      for (const idx of component) {
        result[idx] = 0;
      }
    }
  }

  return result;
}
