/**
 * Contrast-based hold detection
 *
 * Detects holds by finding pixels that differ significantly from the
 * dominant "wall" color. Supports auto-detection or user-specified wall color.
 *
 * Pure, deterministic, no platform dependencies.
 */

import { type HSL, type LAB, type RGB, rgbToHsl, rgbToLab } from '../color';
import { type ColorCluster, clusterColors } from '../mask';

const DEFAULT_K = 3;
const MIN_COMPONENT_RATIO = 0.0004;
const MAX_COMPONENT_RATIO = 0.15;
const DEFAULT_LAB_THRESHOLD = 22;

const labDistance = (a: LAB, b: LAB): number =>
    Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);

const getRgbAt = (pixels: Uint8ClampedArray, idx: number): RGB => ({
    r: pixels[idx],
    g: pixels[idx + 1],
    b: pixels[idx + 2],
});

export interface ContrastDetectionParams {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    /** Optional user-specified wall color. If not provided, auto-detect. */
    wallColor?: HSL;
    /** LAB distance threshold (default 22). */
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

/**
 * Find dominant wall color via clustering.
 * Wall = largest cluster with low-ish saturation or simply the largest.
 */
function detectWallColor(
    pixels: Uint8ClampedArray,
    width: number,
    height: number
): { wallColor: HSL; clusters: ColorCluster[] } {
    const clusters = clusterColors(pixels, width, height, DEFAULT_K);
    if (clusters.length === 0) {
        return { wallColor: { h: 0, s: 0, l: 50 }, clusters: [] };
    }
    // Sort by count (descending). Largest = likely wall.
    const sorted = [...clusters].sort((a, b) => b.count - a.count);
    // Prefer low saturation if among largest
    const topTwo = sorted.slice(0, 2);
    const wall =
        topTwo.find((c) => c.avgSaturation < 25) ?? topTwo[0] ?? sorted[0];
    return { wallColor: wall.center, clusters };
}

/**
 * Erode mask (shrink foreground)
 */
function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
    const result = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let keep = 1;
            for (let dy = -1; dy <= 1 && keep; dy++) {
                for (let dx = -1; dx <= 1 && keep; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
                        keep = 0;
                    } else if (mask[ny * width + nx] === 0) {
                        keep = 0;
                    }
                }
            }
            result[y * width + x] = keep;
        }
    }
    return result;
}

/**
 * Dilate mask (expand foreground)
 */
function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
    const result = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let on = 0;
            for (let dy = -1; dy <= 1 && !on; dy++) {
                for (let dx = -1; dx <= 1 && !on; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
                        if (mask[ny * width + nx] === 1) {
                            on = 1;
                        }
                    }
                }
            }
            result[y * width + x] = on;
        }
    }
    return result;
}

/**
 * Detect holds via contrast with wall color.
 */
export function detectHoldsContrast(
    params: ContrastDetectionParams
): ContrastDetectionResult {
    const { pixels, width, height, threshold = DEFAULT_LAB_THRESHOLD } = params;
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

    // 1. Determine wall color
    const { wallColor, clusters } = params.wallColor
        ? { wallColor: params.wallColor, clusters: clusterColors(pixels, width, height, DEFAULT_K) }
        : detectWallColor(pixels, width, height);

    const wallLab = rgbToLab({
        r: Math.round((wallColor.l / 100) * 255),
        g: Math.round((wallColor.l / 100) * 255),
        b: Math.round((wallColor.l / 100) * 255),
    });
    // Re-compute wall LAB from actual average if possible
    // For simplicity, convert HSL -> approximate RGB -> LAB
    const wallRgb: RGB = hslToRgbApprox(wallColor);
    const wallLabActual = rgbToLab(wallRgb);

    // 2. Build binary mask via LAB distance
    const binaryMask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
        const offset = i * 4;
        const rgb = getRgbAt(pixels, offset);
        const lab = rgbToLab(rgb);
        const dist = labDistance(lab, wallLabActual);
        if (dist > threshold) {
            binaryMask[i] = 1;
        }
    }

    // 3. Morphology: open then close
    let cleaned = dilate(erode(binaryMask, width, height), width, height);
    cleaned = erode(dilate(cleaned, width, height), width, height);

    // 4. Connected components
    const visited = new Uint8Array(total);
    const holds: ContrastHoldCandidate[] = [];
    const minArea = Math.max(30, Math.floor(total * MIN_COMPONENT_RATIO));
    const maxArea = Math.floor(total * MAX_COMPONENT_RATIO);

    let holdId = 0;
    const stack: number[] = [];
    const component: number[] = [];

    for (let i = 0; i < total; i++) {
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

        while (stack.length) {
            const idx = stack.pop()!;
            component.push(idx);
            const x = idx % width;
            const y = Math.floor(idx / width);
            const pixelOffset = idx * 4;
            sumR += pixels[pixelOffset];
            sumG += pixels[pixelOffset + 1];
            sumB += pixels[pixelOffset + 2];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;

            const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
            for (const nidx of neighbors) {
                if (nidx < 0 || nidx >= total) continue;
                if (visited[nidx]) continue;
                if (cleaned[nidx] === 0) continue;
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
        const avgColor = rgbToHsl({
            r: Math.round(sumR / area),
            g: Math.round(sumG / area),
            b: Math.round(sumB / area),
        });
        const score = compactness * Math.min(1, area / (total * 0.01));

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

        holdId++;
    }

    return { width, height, labels, holds, wallColor, clusters };
}

/**
 * Approximate HSL to RGB (good enough for wall color detection).
 */
function hslToRgbApprox(hsl: HSL): RGB {
    const { h, s, l } = hsl;
    const sNorm = s / 100;
    const lNorm = l / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
        r = c;
        g = x;
    } else if (h < 120) {
        r = x;
        g = c;
    } else if (h < 180) {
        g = c;
        b = x;
    } else if (h < 240) {
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
    };
}
