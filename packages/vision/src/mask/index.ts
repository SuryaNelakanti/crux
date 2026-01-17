/**
 * Mask generation pipeline
 *
 * Implements dominant-hold-color masking with clustering + cleanup.
 * 
 * All functions are pure and deterministic.
 * Takes pixel data, returns mask data.
 */

import { rgbToHsl, type RGB, type HSL } from '../color';

const DEFAULT_K = 5;
const MAX_SAMPLE_PIXELS = 15000;
const KMEANS_ITERS = 6;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const hslDistance = (a: HSL, b: HSL): number => {
    const rawHue = Math.abs(a.h - b.h);
    const hue = Math.min(rawHue, 360 - rawHue) / 180; // 0..1
    const sat = (a.s - b.s) / 100;
    const light = (a.l - b.l) / 100;
    return Math.sqrt(hue * hue + sat * sat + light * light);
};

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

const samplePixels = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number
): HSL[] => {
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
    const { width, height, seedColor } = input;
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

    const clusters = seedColor
        ? []
        : clusterColors(input.pixels, width, height, DEFAULT_K);

    const selectedSeed = seedColor ?? clusters[0]?.center ?? { h: 0, s: 0, l: 50 };
    const method: MaskGenerationResult['method'] = seedColor ? 'seed-color' : 'auto';

    const threshold = (() => {
        if (seedColor || clusters.length < 2) return 0.2;
        const distances = clusters
            .slice(1)
            .map((cluster) => hslDistance(cluster.center, selectedSeed));
        const nearest = distances.length
            ? Math.min(...distances)
            : 0.2;
        return clamp(nearest * 0.45, 0.08, 0.22);
    })();

    for (let i = 0; i < width * height; i += 1) {
        const offset = i * 4;
        const rgb: RGB = {
            r: input.pixels[offset],
            g: input.pixels[offset + 1],
            b: input.pixels[offset + 2],
        };
        const hsl = rgbToHsl(rgb);
        const distance = hslDistance(hsl, selectedSeed);
        if (distance <= threshold) {
            mask[i] = 1;
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
export function scoreCluster(
    cluster: ColorCluster,
    totalCount: number = 1
): number {
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
export function cleanupMask(
    mask: Uint8Array,
    _width: number,
    _height: number
): Uint8Array {
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
export function calculateConfidence(
    mask: Uint8Array,
    clusters: ColorCluster[]
): number {
    if (mask.length === 0) return 0;
    const total = mask.length;
    let hits = 0;
    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i]) hits += 1;
    }
    const coverage = hits / total;
    const coverageScore =
        coverage < 0.01 || coverage > 0.6
            ? 0
            : clamp(1 - Math.abs(coverage - 0.15) / 0.35, 0, 1);

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

function removeSmallComponents(
    mask: Uint8Array,
    width: number,
    height: number
): Uint8Array {
    const visited = new Uint8Array(mask.length);
    const result = new Uint8Array(mask);
    const minSize = Math.max(24, Math.floor(width * height * 0.002));

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
