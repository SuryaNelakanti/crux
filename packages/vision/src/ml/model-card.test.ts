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
});
