import { modelMetadataFromCard, validateRouteMaskModelCard } from './model-card';

const hash = 'a'.repeat(64);

const validCard = {
  schemaVersion: 1,
  family: 'yolo26-seg',
  method: 'ml-yolo26-seg',
  input: {
    imageSize: 1024,
    colorSpace: 'RGB',
    output: 'hold instance masks grouped into route masks by median color',
  },
  files: {
    model: {
      path: 'best.onnx',
      sha256: hash,
      bytes: 123,
      artifactType: 'file',
    },
    datasetManifest: {
      path: 'manifest.jsonl',
      sha256: 'b'.repeat(64),
    },
  },
  metrics: {
    imageCount: 10,
    allHold: {
      recall: 0.94,
    },
    bestRouteGroupIou: 0.8,
    autoRouteIou: 0.71,
    runtimeMs: {
      p90: 900,
    },
    gates: {
      allHoldRecall: true,
      bestRouteGroupIou: true,
      autoRouteIou: true,
      p90RuntimeMs: true,
    },
  },
  integration: {
    offlineOnly: true,
    fallback: '@crux/vision deterministic generateRouteMask',
    maskVersionMethod: 'ml-yolo26-seg',
    storeModelHashWithMask: true,
    networkRequiredForInference: false,
  },
};

describe('route mask model card', () => {
  it('validates a promoted offline model card and extracts mask metadata', () => {
    const card = validateRouteMaskModelCard(validCard);
    const metadata = modelMetadataFromCard(card);

    expect(metadata).toEqual({
      method: 'ml-yolo26-seg',
      family: 'yolo26-seg',
      modelHash: hash,
      modelBytes: 123,
      imageSize: 1024,
      validation: {
        imageCount: 10,
        allHoldRecall: 0.94,
        bestRouteGroupIou: 0.8,
        autoRouteIou: 0.71,
        p90RuntimeMs: 900,
      },
    });
  });

  it('rejects model cards that require network inference', () => {
    expect(() =>
      validateRouteMaskModelCard({
        ...validCard,
        integration: {
          ...validCard.integration,
          networkRequiredForInference: true,
        },
      })
    ).toThrow('integration.networkRequiredForInference must be false');
  });

  it('rejects model cards with failed promotion gates', () => {
    expect(() =>
      validateRouteMaskModelCard({
        ...validCard,
        metrics: {
          ...validCard.metrics,
          gates: {
            ...validCard.metrics.gates,
            autoRouteIou: false,
          },
        },
      })
    ).toThrow('metrics.gates.autoRouteIou must be true');
  });

  it('validates a SAM+Crux combo model card without fallback policy', () => {
    const card = validateRouteMaskModelCard({
      schemaVersion: 2,
      family: 'sam-crux-combo',
      method: 'ml-combo-v1',
      segmentationPrimitive: {
        family: 'sam-family',
        name: 'sam3',
        frozen: true,
        prompt: 'climbing hold',
      },
      files: {
        cruxHeads: {
          path: 'combo-heads.onnx',
          sha256: hash,
          bytes: 456,
          artifactType: 'file',
        },
      },
      thresholds: { hold: 0.5 },
      metrics: {
        imageCount: 3,
        proposalRecall: 0.95,
        holdProposal: { f1: 0.86 },
        allHold: { recall: 0.93, f1: 0.84 },
        bestRouteGroupIou: 0.79,
        autoRouteIou: 0.7,
        runtimeMs: { p90: 900 },
        gates: {
          proposalRecall: true,
          holdProposalF1: true,
          bestRouteGroupIou: true,
          autoRouteIou: true,
          p90RuntimeMs: true,
        },
      },
      integration: {
        offlineOnly: true,
        fallbackPolicy: 'none',
        maskVersionMethod: 'ml-combo-v1',
        storeModelHashWithMask: true,
        networkRequiredForInference: false,
      },
    });
    const metadata = modelMetadataFromCard(card);

    expect(metadata).toMatchObject({
      method: 'ml-combo-v1',
      family: 'sam-crux-combo',
      modelHash: hash,
      modelBytes: 456,
      validation: {
        imageCount: 3,
        allHoldRecall: 0.93,
        bestRouteGroupIou: 0.79,
        autoRouteIou: 0.7,
        p90RuntimeMs: 900,
      },
    });
  });
});
