import { detectHolds, type HoldDetectionResult } from '@crux/vision';
import { readImagePixels } from './image';

const hslDistance = (a: { h: number; s: number; l: number }, b: { h: number; s: number; l: number }): number => {
  const rawHue = Math.abs(a.h - b.h);
  const hue = Math.min(rawHue, 360 - rawHue) / 180;
  const sat = (a.s - b.s) / 100;
  const light = (a.l - b.l) / 100;
  const hueWeight = 1.4;
  const lightWeight = 0.9;
  return Math.sqrt((hue * hueWeight) ** 2 + sat * sat + (light * lightWeight) ** 2);
};

export async function detectHoldsFromPhoto(params: {
  uri: string;
  maxWidth?: number;
}): Promise<ReturnType<typeof detectHolds>> {
  const { pixels, width, height } = await readImagePixels({
    uri: params.uri,
    maxWidth: params.maxWidth,
  });
  return detectHolds({ pixels, width, height });
}

export const buildRouteMaskForCluster = (
  detection: HoldDetectionResult,
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
  detection: HoldDetectionResult,
  holdId: number | null,
  options?: { threshold?: number }
): Uint8Array => {
  const { labels, holds, width, height } = detection;
  const routeMask = new Uint8Array(width * height);
  if (holdId === null || holdId < 0) return routeMask;
  const targetHold = holds[holdId];
  if (!targetHold) return routeMask;
  const target = targetHold.avgColor ?? targetHold.center;
  const threshold =
    options?.threshold ??
    (target.s < 18 ? 0.11 : 0.15);

  const matching = new Set<number>();
  for (const hold of holds) {
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

export const pickBestCluster = (detection: HoldDetectionResult): number | null => {
  const clusterScores = new Map<number, number>();
  for (const hold of detection.holds) {
    clusterScores.set(
      hold.clusterIndex,
      (clusterScores.get(hold.clusterIndex) ?? 0) + hold.score
    );
  }
  return [...clusterScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
