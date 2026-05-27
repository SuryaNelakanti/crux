import type { HSL } from '../color';

export type ComboRouteMaskMethod = 'ml-combo-v1';

export interface SamMaskProposal {
  id: number;
  mask: Uint8Array;
  width: number;
  height: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
  score: number;
  avgColor: HSL;
  edgeConfidence?: number;
}

export interface ScoredHoldProposal {
  proposalId: number;
  isHold: number;
  routeRelevance: number;
  quality: number;
  routeEmbedding?: number[];
  colorFamily?: string;
}

export interface RouteCandidate {
  id: number;
  proposalIds: number[];
  mask: Uint8Array;
  width: number;
  height: number;
  avgColor: HSL;
  score: number;
  selectorFeatures: {
    holdCount: number;
    holdConfidence: number;
    routeRelevance: number;
    colorConsistency: number;
    spatialSpread: number;
    visualSalience: number;
  };
}

export interface ComboRouteMaskMetadata {
  method: ComboRouteMaskMethod;
  modelFamily: string;
  modelHash: string;
  modelCardPath?: string;
  segmentationPrimitive: 'sam-family';
  proposalCount: number;
  acceptedHoldCount: number;
  routeCandidateCount: number;
  selectedRouteCandidateId: number | null;
  runtimeMs?: {
    proposal?: number;
    scoring?: number;
    grouping?: number;
    selection?: number;
    total?: number;
  };
}

export interface ComboRouteMaskResult {
  mask: Uint8Array;
  width: number;
  height: number;
  method: ComboRouteMaskMethod;
  confidence: number;
  proposals: SamMaskProposal[];
  scoredProposals: ScoredHoldProposal[];
  routeCandidates: RouteCandidate[];
  selectedRouteCandidateId: number | null;
  metadata: ComboRouteMaskMetadata;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function comboRouteMaskMetadataFromResult(
  result: Pick<
    ComboRouteMaskResult,
    | 'method'
    | 'proposals'
    | 'scoredProposals'
    | 'routeCandidates'
    | 'selectedRouteCandidateId'
    | 'metadata'
  >
): ComboRouteMaskMetadata {
  return {
    ...result.metadata,
    method: result.method,
    proposalCount: result.proposals.length,
    acceptedHoldCount: result.scoredProposals.filter((proposal) => proposal.isHold >= 0.5).length,
    routeCandidateCount: result.routeCandidates.length,
    selectedRouteCandidateId: result.selectedRouteCandidateId,
  };
}

export function scoreRouteCandidateConfidence(
  candidate: Pick<RouteCandidate, 'score' | 'selectorFeatures'>
): number {
  const features = candidate.selectorFeatures;
  return clamp01(
    candidate.score * 0.32 +
      features.holdConfidence * 0.2 +
      features.routeRelevance * 0.18 +
      features.colorConsistency * 0.12 +
      features.spatialSpread * 0.08 +
      features.visualSalience * 0.1
  );
}
