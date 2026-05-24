import type { HSL } from '../color';
import {
  type ContrastDetectionResult,
  type ContrastHoldCandidate,
  detectHoldsContrast,
} from '../holds/contrast';
import { generateMask, type MaskGenerationInput } from '../mask';

export interface RouteHoldGroup {
  id: number;
  holdIds: number[];
  avgColor: HSL;
  area: number;
  score: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  holdCount: number;
  selection?: {
    score: number;
    coverage: number;
    coverageScore: number;
    colorContrastScore: number;
    saturationScore: number;
    lightnessScore: number;
    holdCountScore: number;
    spreadScore: number;
    edgePenalty: number;
    lightnessPenalty: number;
    wideSpreadPenalty: number;
  };
}

export interface RouteMaskGenerationInput extends MaskGenerationInput {
  wallColor?: HSL;
}

export interface RouteMaskGenerationResult {
  mask: Uint8Array;
  width: number;
  height: number;
  seedColor: HSL;
  confidence: number;
  method: 'auto' | 'seed-color';
  detection: ContrastDetectionResult;
  groups: RouteHoldGroup[];
  selectedGroupId: number | null;
  coverage: number;
  fallback: boolean;
}

const hslDistance = (a: HSL, b: HSL): number => {
  const rawHue = Math.abs(a.h - b.h);
  const hue = Math.min(rawHue, 360 - rawHue) / 180;
  const sat = (a.s - b.s) / 100;
  const light = (a.l - b.l) / 100;
  return Math.sqrt((hue * 1.35) ** 2 + sat * sat + (light * 0.75) ** 2);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

type GroupableHold = Pick<ContrastHoldCandidate, 'id' | 'avgColor' | 'area' | 'score'> &
  Partial<Pick<ContrastHoldCandidate, 'bbox'>>;

const weightedAverageHsl = (holds: Pick<ContrastHoldCandidate, 'avgColor' | 'area'>[]): HSL => {
  let sumSin = 0;
  let sumCos = 0;
  let sumS = 0;
  let sumL = 0;
  let total = 0;
  for (const hold of holds) {
    const weight = Math.max(1, hold.area);
    const rad = (hold.avgColor.h * Math.PI) / 180;
    sumSin += Math.sin(rad) * weight;
    sumCos += Math.cos(rad) * weight;
    sumS += hold.avgColor.s * weight;
    sumL += hold.avgColor.l * weight;
    total += weight;
  }

  let hue = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {
    h: Math.round(hue),
    s: Math.round(sumS / Math.max(1, total)),
    l: Math.round(sumL / Math.max(1, total)),
  };
};

export function groupHoldsByColor(
  holds: GroupableHold[],
  options?: { threshold?: number }
): RouteHoldGroup[] {
  const groups: {
    holds: GroupableHold[];
    avgColor: HSL;
  }[] = [];

  const sorted = [...holds].sort((a, b) => b.area * b.score - a.area * a.score);
  for (const hold of sorted) {
    const threshold = options?.threshold ?? (hold.avgColor.s < 28 ? 0.12 : 0.18);
    let bestGroupIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < groups.length; i += 1) {
      const distance = hslDistance(hold.avgColor, groups[i].avgColor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestGroupIndex = i;
      }
    }

    if (bestGroupIndex >= 0 && bestDistance <= threshold) {
      groups[bestGroupIndex].holds.push(hold);
      groups[bestGroupIndex].avgColor = weightedAverageHsl(groups[bestGroupIndex].holds);
    } else {
      groups.push({ holds: [hold], avgColor: hold.avgColor });
    }
  }

  return groups
    .map((group, id) => {
      const area = group.holds.reduce((sum, hold) => sum + hold.area, 0);
      const score = group.holds.reduce(
        (sum, hold) => sum + hold.score * Math.sqrt(Math.max(1, hold.area)),
        0
      );
      const bboxes = group.holds
        .map((hold) => hold.bbox)
        .filter((bbox): bbox is ContrastHoldCandidate['bbox'] => Boolean(bbox));
      const bbox = bboxes.length
        ? {
            minX: Math.min(...bboxes.map((box) => box.minX)),
            minY: Math.min(...bboxes.map((box) => box.minY)),
            maxX: Math.max(...bboxes.map((box) => box.maxX)),
            maxY: Math.max(...bboxes.map((box) => box.maxY)),
          }
        : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      return {
        id,
        holdIds: group.holds.map((hold) => hold.id).sort((a, b) => a - b),
        avgColor: group.avgColor,
        area,
        score,
        bbox,
        holdCount: group.holds.length,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((group, id) => ({ ...group, id }));
}

function scoreRouteGroup(params: {
  detection: ContrastDetectionResult;
  group: RouteHoldGroup;
}): NonNullable<RouteHoldGroup['selection']> {
  const { detection, group } = params;
  const total = Math.max(1, detection.width * detection.height);
  const coverage = group.area / total;
  const coverageScore =
    coverage < 0.0008
      ? 0.08
      : coverage < 0.003
        ? clamp(coverage / 0.003, 0, 1) * 0.82
        : coverage <= 0.055
          ? 1
          : coverage <= 0.12
            ? clamp(1 - (coverage - 0.055) / 0.065, 0.35, 1)
            : 0.18;
  const colorContrastScore = clamp(
    (hslDistance(group.avgColor, detection.wallColor) - 0.08) / 0.36,
    0,
    1
  );
  const saturationScore = clamp((group.avgColor.s - 12) / 58, 0, 1);
  const lightnessScore = clamp(1 - Math.abs(group.avgColor.l - 55) / 58, 0, 1);
  const darkPenalty = clamp((18 - group.avgColor.l) / 18, 0, 1) * 0.18;
  const brightPenalty = clamp((group.avgColor.l - 96) / 4, 0, 1) * 0.1;
  const lightnessPenalty = Math.min(0.2, darkPenalty + brightPenalty);
  const holdCountScore = clamp((group.holdCount - 1) / 5, 0, 1);
  const bboxWidth = Math.max(1, group.bbox.maxX - group.bbox.minX + 1);
  const bboxHeight = Math.max(1, group.bbox.maxY - group.bbox.minY + 1);
  const spread = Math.sqrt(
    (bboxWidth / detection.width) ** 2 + (bboxHeight / detection.height) ** 2
  );
  const spreadScore = clamp((spread - 0.08) / 0.48, 0, 1);
  const wideSpreadPenalty = Math.min(0.08, clamp((spreadScore - 0.85) / 0.15, 0, 1) * 0.08);
  const touchesEdge =
    (group.bbox.minX <= detection.width * 0.01 ? 1 : 0) +
    (group.bbox.maxX >= detection.width * 0.99 ? 1 : 0) +
    (group.bbox.minY <= detection.height * 0.01 ? 1 : 0) +
    (group.bbox.maxY >= detection.height * 0.99 ? 1 : 0);
  const edgePenalty = touchesEdge * 0.12 + (coverage > 0.18 ? 0.32 : 0);
  const rawScore = clamp(group.score / 120, 0, 1);
  const score = clamp(
    rawScore * 0.22 +
      coverageScore * 0.14 +
      colorContrastScore * 0.12 +
      saturationScore * 0.26 +
      lightnessScore * 0.12 +
      holdCountScore * 0.08 +
      spreadScore * 0.02 -
      edgePenalty * 0.8 -
      lightnessPenalty * 0.8 -
      wideSpreadPenalty * 0.6,
    0,
    1
  );
  return {
    score,
    coverage,
    coverageScore,
    colorContrastScore,
    saturationScore,
    lightnessScore,
    holdCountScore,
    spreadScore,
    edgePenalty,
    lightnessPenalty,
    wideSpreadPenalty,
  };
}

function rankRouteGroups(
  detection: ContrastDetectionResult,
  groups: RouteHoldGroup[]
): RouteHoldGroup[] {
  return groups
    .map((group) => ({ ...group, selection: scoreRouteGroup({ detection, group }) }))
    .sort((a, b) => {
      const scoreDelta = (b.selection?.score ?? 0) - (a.selection?.score ?? 0);
      return scoreDelta || b.score - a.score;
    })
    .map((group, id) => ({ ...group, id }));
}

export function buildRouteMaskForGroup(
  detection: Pick<ContrastDetectionResult, 'width' | 'height' | 'labels'>,
  group: Pick<RouteHoldGroup, 'holdIds'> | null
): Uint8Array {
  const mask = new Uint8Array(detection.width * detection.height);
  if (!group) return mask;
  const holdIds = new Set(group.holdIds);
  for (let i = 0; i < detection.labels.length; i += 1) {
    if (holdIds.has(detection.labels[i])) {
      mask[i] = 1;
    }
  }
  return mask;
}

function findSeedHoldId(
  detection: ContrastDetectionResult,
  seedPoint: { x: number; y: number } | undefined
): number | null {
  if (!seedPoint) return null;
  const x = Math.min(detection.width - 1, Math.max(0, Math.round(seedPoint.x)));
  const y = Math.min(detection.height - 1, Math.max(0, Math.round(seedPoint.y)));
  const direct = detection.labels[y * detection.width + x];
  if (direct >= 0) return direct;

  let bestId: number | null = null;
  let bestDistance = Infinity;
  for (const hold of detection.holds) {
    const cx = (hold.bbox.minX + hold.bbox.maxX) / 2;
    const cy = (hold.bbox.minY + hold.bbox.maxY) / 2;
    const distance = (cx - x) ** 2 + (cy - y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = hold.id;
    }
  }
  return bestId;
}

function selectGroup(params: {
  detection: ContrastDetectionResult;
  groups: RouteHoldGroup[];
  seedColor?: HSL;
  seedPoint?: { x: number; y: number };
}): RouteHoldGroup | null {
  const seedHoldId = findSeedHoldId(params.detection, params.seedPoint);
  if (seedHoldId !== null) {
    return params.groups.find((group) => group.holdIds.includes(seedHoldId)) ?? null;
  }

  if (params.seedColor) {
    return (
      [...params.groups].sort(
        (a, b) =>
          hslDistance(a.avgColor, params.seedColor as HSL) -
          hslDistance(b.avgColor, params.seedColor as HSL)
      )[0] ?? null
    );
  }

  const total = Math.max(1, params.detection.width * params.detection.height);
  return (
    [...params.groups].sort((a, b) => {
      const aScore =
        a.selection?.score ?? scoreRouteGroup({ detection: params.detection, group: a }).score;
      const bScore =
        b.selection?.score ?? scoreRouteGroup({ detection: params.detection, group: b }).score;
      const aCoverage = a.area / total;
      const bCoverage = b.area / total;
      const aPenalty = aCoverage > 0.2 || aCoverage < 0.0008 ? 0.35 : 1;
      const bPenalty = bCoverage > 0.2 || bCoverage < 0.0008 ? 0.35 : 1;
      return bScore * bPenalty - aScore * aPenalty;
    })[0] ?? null
  );
}

function countMask(mask: Uint8Array): number {
  let hits = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) hits += 1;
  }
  return hits;
}

export function generateRouteMask(input: RouteMaskGenerationInput): RouteMaskGenerationResult {
  const detection = detectHoldsContrast({
    pixels: input.pixels,
    width: input.width,
    height: input.height,
    wallColor: input.wallColor,
  });
  const groups = rankRouteGroups(detection, groupHoldsByColor(detection.holds));
  const selectedGroup = selectGroup({
    detection,
    groups,
    seedColor: input.seedColor,
    seedPoint: input.seedPoint,
  });
  const routeMask = buildRouteMaskForGroup(detection, selectedGroup);
  const hits = countMask(routeMask);
  const coverage = hits / Math.max(1, routeMask.length);

  if (selectedGroup && coverage > 0) {
    const confidence = Math.min(
      1,
      Math.max(0, selectedGroup.score / 120 + Math.min(coverage / 0.12, 1) * 0.25)
    );
    return {
      mask: routeMask,
      width: input.width,
      height: input.height,
      seedColor: selectedGroup.avgColor,
      confidence,
      method: input.seedColor || input.seedPoint ? 'seed-color' : 'auto',
      detection,
      groups,
      selectedGroupId: selectedGroup.id,
      coverage,
      fallback: false,
    };
  }

  const fallback = generateMask(input);
  const fallbackCoverage = countMask(fallback.mask) / Math.max(1, fallback.mask.length);
  return {
    mask: fallback.mask,
    width: input.width,
    height: input.height,
    seedColor: fallback.seedColor,
    confidence: fallback.confidence,
    method: fallback.method,
    detection,
    groups,
    selectedGroupId: null,
    coverage: fallbackCoverage,
    fallback: true,
  };
}
