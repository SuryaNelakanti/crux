import {
  type ContrastDetectionResult,
  type ContrastHoldCandidate,
  detectHoldsContrast,
  type HSL,
} from '@crux/vision';
import { readImagePixels } from './image';

const hslDistance = (
  a: { h: number; s: number; l: number },
  b: { h: number; s: number; l: number }
): number => {
  const rawHue = Math.abs(a.h - b.h);
  const hue = Math.min(rawHue, 360 - rawHue) / 180;
  const sat = (a.s - b.s) / 100;
  const light = (a.l - b.l) / 100;
  const hueWeight = 1.4;
  const lightWeight = 0.9;
  return Math.sqrt((hue * hueWeight) ** 2 + sat * sat + (light * lightWeight) ** 2);
};

export type EnrichedContrastHoldCandidate = ContrastHoldCandidate & {
  clusterIndex: number;
  center: HSL;
};
export type EnrichedDetectionResult = Omit<ContrastDetectionResult, 'holds'> & {
  holds: EnrichedContrastHoldCandidate[];
};

export async function detectHoldsFromPhoto(params: {
  uri: string;
  maxWidth?: number;
  wallColor?: HSL;
}): Promise<EnrichedDetectionResult> {
  const { pixels, width, height } = await readImagePixels({
    uri: params.uri,
    maxWidth: params.maxWidth,
  });
  const detection = detectHoldsContrast({ pixels, width, height, wallColor: params.wallColor });

  // Polyfill for legacy consumers (api.ts) that expect clusterIndex/center
  const enrichedHolds: EnrichedContrastHoldCandidate[] = detection.holds.map((hold) => {
    let bestIndex = -1;
    let bestDist = Infinity;
    detection.clusters.forEach((cluster, idx) => {
      const dist = hslDistance(hold.avgColor, cluster.center);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = idx;
      }
    });
    return {
      ...hold,
      clusterIndex: bestIndex,
      center: hold.avgColor,
    };
  });

  return { ...detection, holds: enrichedHolds };
}

export const buildRouteMaskForCluster = (
  detection: {
    labels: Int32Array;
    holds: { clusterIndex: number; id: number }[];
    width: number;
    height: number;
  },
  clusterIndex: number | null
): Uint8Array => {
  const { labels, holds, width, height } = detection;
  const routeMask = new Uint8Array(width * height);
  if (clusterIndex === null) return routeMask;
  for (let i = 0; i < labels.length; i += 1) {
    const holdId = labels[i];
    if (holdId < 0) continue;
    const hold = holds[holdId];
    if (hold && hold.clusterIndex === clusterIndex) {
      routeMask[i] = 1;
    }
  }
  return routeMask;
};

export const buildRouteMaskForHoldColor = (
  detection: {
    labels: Int32Array;
    holds: { id: number; avgColor: HSL; center: HSL; clusterIndex: number }[];
    width: number;
    height: number;
  },
  holdId: number | null,
  options?: { threshold?: number }
): Uint8Array => {
  const { labels, holds, width, height } = detection;
  const routeMask = new Uint8Array(width * height);
  if (holdId === null || holdId < 0) return routeMask;
  const targetHold = holds[holdId];
  if (!targetHold) return routeMask;
  const target = targetHold.avgColor ?? targetHold.center;
  const targetCluster = targetHold.clusterIndex;
  const threshold = options?.threshold ?? (target.s < 18 ? 0.11 : 0.15);

  const matching = new Set<number>();
  for (const hold of holds) {
    if (hold.clusterIndex !== targetCluster) continue;
    const color = hold.avgColor ?? hold.center;
    if (hslDistance(color, target) <= threshold) {
      matching.add(hold.id);
    }
  }

  for (let i = 0; i < labels.length; i += 1) {
    const id = labels[i];
    if (id >= 0 && matching.has(id)) {
      routeMask[i] = 1;
    }
  }

  return routeMask;
};

export const pickBestCluster = (detection: {
  holds: { clusterIndex: number; score: number }[];
}): number | null => {
  const clusterScores = new Map<number, number>();
  for (const hold of detection.holds) {
    clusterScores.set(hold.clusterIndex, (clusterScores.get(hold.clusterIndex) ?? 0) + hold.score);
  }
  return [...clusterScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
