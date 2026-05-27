import {
  type ComboRouteMaskResult,
  comboRouteMaskMetadataFromResult,
  scoreRouteCandidateConfidence,
} from './combo';

describe('combo route-mask contract', () => {
  const baseResult: ComboRouteMaskResult = {
    mask: new Uint8Array([1, 0, 1, 0]),
    width: 2,
    height: 2,
    method: 'ml-combo-v1',
    confidence: 0.82,
    proposals: [
      {
        id: 0,
        mask: new Uint8Array([1, 0, 0, 0]),
        width: 2,
        height: 2,
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        area: 1,
        score: 0.9,
        avgColor: { h: 210, s: 72, l: 48 },
      },
      {
        id: 1,
        mask: new Uint8Array([0, 0, 1, 0]),
        width: 2,
        height: 2,
        bbox: { minX: 0, minY: 1, maxX: 0, maxY: 1 },
        area: 1,
        score: 0.8,
        avgColor: { h: 212, s: 70, l: 50 },
      },
    ],
    scoredProposals: [
      { proposalId: 0, isHold: 0.94, routeRelevance: 0.88, quality: 0.91 },
      { proposalId: 1, isHold: 0.42, routeRelevance: 0.2, quality: 0.7 },
    ],
    routeCandidates: [
      {
        id: 7,
        proposalIds: [0],
        mask: new Uint8Array([1, 0, 0, 0]),
        width: 2,
        height: 2,
        avgColor: { h: 210, s: 72, l: 48 },
        score: 0.8,
        selectorFeatures: {
          holdCount: 1,
          holdConfidence: 0.94,
          routeRelevance: 0.88,
          colorConsistency: 0.92,
          spatialSpread: 0.45,
          visualSalience: 0.74,
        },
      },
    ],
    selectedRouteCandidateId: 7,
    metadata: {
      method: 'ml-combo-v1',
      modelFamily: 'sam-crux-combo',
      modelHash: 'f'.repeat(64),
      segmentationPrimitive: 'sam-family',
      proposalCount: 0,
      acceptedHoldCount: 0,
      routeCandidateCount: 0,
      selectedRouteCandidateId: null,
    },
  };

  it('summarizes stable metadata from a combo result', () => {
    expect(comboRouteMaskMetadataFromResult(baseResult)).toMatchObject({
      method: 'ml-combo-v1',
      proposalCount: 2,
      acceptedHoldCount: 1,
      routeCandidateCount: 1,
      selectedRouteCandidateId: 7,
    });
  });

  it('scores route candidate confidence from selector features', () => {
    expect(scoreRouteCandidateConfidence(baseResult.routeCandidates[0])).toBeGreaterThan(0.7);
    expect(
      scoreRouteCandidateConfidence({
        score: 3,
        selectorFeatures: {
          holdCount: 9,
          holdConfidence: 1,
          routeRelevance: 1,
          colorConsistency: 1,
          spatialSpread: 1,
          visualSalience: 1,
        },
      })
    ).toBe(1);
  });
});
