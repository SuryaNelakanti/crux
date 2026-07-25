export type RouteMaskModelCard = RouteMaskModelCardV1 | RouteMaskComboModelCard;

export interface RouteMaskModelCardV1 {
  schemaVersion: 1;
  family: string;
  method: string;
  input: {
    imageSize: number;
    colorSpace: 'RGB';
    output: string;
  };
  files: {
    model: ModelArtifact;
    sourceModel?: Partial<ModelArtifact> & { path: string };
    datasetManifest?: HashReference;
    evalSummary?: HashReference;
  };
  metrics: {
    imageCount: number;
    allHold?: {
      iou?: number;
      precision?: number;
      recall?: number;
      f1?: number;
    };
    componentRecall?: number;
    bestRouteGroupIou?: number;
    autoRouteIou?: number;
    runtimeMs?: {
      p50?: number;
      p90?: number;
    };
    gates: {
      allHoldRecall: boolean;
      bestRouteGroupIou: boolean;
      autoRouteIou: boolean;
      p90RuntimeMs: boolean;
    };
  };
  integration: {
    offlineOnly: true;
    fallback: string;
    maskVersionMethod: string;
    storeModelHashWithMask: true;
    networkRequiredForInference: false;
  };
}

export interface RouteMaskComboModelCard {
  schemaVersion: 2;
  family: 'sam-crux-combo';
  method: 'ml-combo-v1';
  segmentationPrimitive: {
    family: 'sam-family';
    name: string;
    frozen: true;
    prompt?: string;
  };
  files: {
    cruxHeads: ModelArtifact;
    samPrimitive?: Omit<Partial<ModelArtifact>, 'artifactType'> & {
      path: string;
      artifactType?: 'file' | 'directory' | 'external-missing';
    };
    datasetManifest?: HashReference;
    evalSummary?: HashReference;
    proposalSummary?: HashReference;
  };
  thresholds: {
    hold: number;
  };
  metrics: {
    imageCount: number;
    proposalRecall?: number;
    holdProposal?: {
      precision?: number;
      recall?: number;
      f1?: number;
    };
    allHold?: {
      recall?: number;
      f1?: number;
    };
    bestRouteGroupIou?: number;
    autoRouteIou?: number;
    runtimeMs?: {
      p50?: number;
      p90?: number;
    };
    gates: {
      proposalRecall: boolean;
      holdProposalF1: boolean;
      bestRouteGroupIou: boolean;
      autoRouteIou: boolean;
      p90RuntimeMs: boolean;
    };
  };
  integration: {
    offlineOnly: true;
    fallbackPolicy: 'none';
    maskVersionMethod: 'ml-combo-v1';
    storeModelHashWithMask: true;
    networkRequiredForInference: false;
  };
  license?: {
    requiresReviewBeforeDistribution?: boolean;
    notes?: string;
  };
}

export interface ModelArtifact {
  path: string;
  sha256: string;
  bytes: number;
  artifactType: 'file' | 'directory';
}

export interface HashReference {
  path: string;
  sha256: string;
}

export interface RouteMaskModelMetadata {
  method: string;
  family: string;
  modelHash: string;
  modelBytes: number;
  imageSize: number;
  validation: {
    imageCount: number;
    allHoldRecall?: number;
    bestRouteGroupIou?: number;
    autoRouteIou?: number;
    p90RuntimeMs?: number;
  };
}

export function validateRouteMaskModelCard(value: unknown): RouteMaskModelCard {
  if (!isRecord(value)) throw new Error('Model card must be an object');
  if (value.schemaVersion === 2) return validateComboModelCard(value);
  if (value.schemaVersion !== 1) throw new Error('Model card schemaVersion must be 1 or 2');
  const family = requireString(value.family, 'family');
  const method = requireString(value.method, 'method');

  const input = requireRecord(value.input, 'input');
  const imageSize = requirePositiveNumber(input.imageSize, 'input.imageSize');
  if (input.colorSpace !== 'RGB') throw new Error('input.colorSpace must be RGB');
  const output = requireString(input.output, 'input.output');

  const files = requireRecord(value.files, 'files');
  const model = parseModelArtifact(files.model, 'files.model');
  const metrics = requireRecord(value.metrics, 'metrics');
  const gates = requireRecord(metrics.gates, 'metrics.gates');
  for (const gate of ['allHoldRecall', 'bestRouteGroupIou', 'autoRouteIou', 'p90RuntimeMs']) {
    if (gates[gate] !== true) throw new Error(`metrics.gates.${gate} must be true`);
  }

  const integration = requireRecord(value.integration, 'integration');
  if (integration.offlineOnly !== true) throw new Error('integration.offlineOnly must be true');
  if (integration.networkRequiredForInference !== false) {
    throw new Error('integration.networkRequiredForInference must be false');
  }
  if (integration.storeModelHashWithMask !== true) {
    throw new Error('integration.storeModelHashWithMask must be true');
  }
  const fallback = requireString(integration.fallback, 'integration.fallback');
  const maskVersionMethod = requireString(
    integration.maskVersionMethod,
    'integration.maskVersionMethod'
  );
  const imageCount = requirePositiveNumber(metrics.imageCount, 'metrics.imageCount');

  return {
    schemaVersion: 1,
    family,
    method,
    input: {
      imageSize,
      colorSpace: 'RGB',
      output,
    },
    files: {
      model,
      sourceModel: isRecord(files.sourceModel)
        ? {
            path: requireString(files.sourceModel.path, 'files.sourceModel.path'),
            sha256:
              typeof files.sourceModel.sha256 === 'string' ? files.sourceModel.sha256 : undefined,
            bytes:
              typeof files.sourceModel.bytes === 'number' ? files.sourceModel.bytes : undefined,
            artifactType:
              files.sourceModel.artifactType === 'file' ||
              files.sourceModel.artifactType === 'directory'
                ? files.sourceModel.artifactType
                : undefined,
          }
        : undefined,
      datasetManifest: isRecord(files.datasetManifest)
        ? parseHashReference(files.datasetManifest, 'files.datasetManifest')
        : undefined,
      evalSummary: isRecord(files.evalSummary)
        ? parseHashReference(files.evalSummary, 'files.evalSummary')
        : undefined,
    },
    metrics: {
      imageCount,
      allHold: isRecord(metrics.allHold)
        ? {
            iou: optionalNumber(metrics.allHold.iou),
            precision: optionalNumber(metrics.allHold.precision),
            recall: optionalNumber(metrics.allHold.recall),
            f1: optionalNumber(metrics.allHold.f1),
          }
        : undefined,
      componentRecall: optionalNumber(metrics.componentRecall),
      bestRouteGroupIou: optionalNumber(metrics.bestRouteGroupIou),
      autoRouteIou: optionalNumber(metrics.autoRouteIou),
      runtimeMs: isRecord(metrics.runtimeMs)
        ? {
            p50: optionalNumber(metrics.runtimeMs.p50),
            p90: optionalNumber(metrics.runtimeMs.p90),
          }
        : undefined,
      gates: {
        allHoldRecall: true,
        bestRouteGroupIou: true,
        autoRouteIou: true,
        p90RuntimeMs: true,
      },
    },
    integration: {
      offlineOnly: true,
      fallback,
      maskVersionMethod,
      storeModelHashWithMask: true,
      networkRequiredForInference: false,
    },
  };
}

export function modelMetadataFromCard(card: RouteMaskModelCard): RouteMaskModelMetadata {
  if (card.schemaVersion === 2) {
    return {
      method: card.integration.maskVersionMethod,
      family: card.family,
      modelHash: card.files.cruxHeads.sha256,
      modelBytes: card.files.cruxHeads.bytes,
      imageSize: 0,
      validation: {
        imageCount: card.metrics.imageCount,
        allHoldRecall: card.metrics.allHold?.recall,
        bestRouteGroupIou: card.metrics.bestRouteGroupIou,
        autoRouteIou: card.metrics.autoRouteIou,
        p90RuntimeMs: card.metrics.runtimeMs?.p90,
      },
    };
  }
  return {
    method: card.integration.maskVersionMethod,
    family: card.family,
    modelHash: card.files.model.sha256,
    modelBytes: card.files.model.bytes,
    imageSize: card.input.imageSize,
    validation: {
      imageCount: card.metrics.imageCount,
      allHoldRecall: card.metrics.allHold?.recall,
      bestRouteGroupIou: card.metrics.bestRouteGroupIou,
      autoRouteIou: card.metrics.autoRouteIou,
      p90RuntimeMs: card.metrics.runtimeMs?.p90,
    },
  };
}

function validateComboModelCard(value: Record<string, unknown>): RouteMaskComboModelCard {
  if (value.family !== 'sam-crux-combo') {
    throw new Error('family must be sam-crux-combo for schemaVersion 2');
  }
  if (value.method !== 'ml-combo-v1') {
    throw new Error('method must be ml-combo-v1 for schemaVersion 2');
  }
  const primitive = requireRecord(value.segmentationPrimitive, 'segmentationPrimitive');
  if (primitive.family !== 'sam-family') throw new Error('segmentationPrimitive.family must be sam-family');
  if (primitive.frozen !== true) throw new Error('segmentationPrimitive.frozen must be true');
  const files = requireRecord(value.files, 'files');
  const cruxHeads = parseModelArtifact(files.cruxHeads, 'files.cruxHeads');
  const thresholds = requireRecord(value.thresholds, 'thresholds');
  const holdThreshold = requirePositiveNumber(thresholds.hold, 'thresholds.hold');
  const metrics = requireRecord(value.metrics, 'metrics');
  const gates = requireRecord(metrics.gates, 'metrics.gates');
  for (const gate of [
    'proposalRecall',
    'holdProposalF1',
    'bestRouteGroupIou',
    'autoRouteIou',
    'p90RuntimeMs',
  ]) {
    if (gates[gate] !== true) throw new Error(`metrics.gates.${gate} must be true`);
  }
  const integration = requireRecord(value.integration, 'integration');
  if (integration.offlineOnly !== true) throw new Error('integration.offlineOnly must be true');
  if (integration.networkRequiredForInference !== false) {
    throw new Error('integration.networkRequiredForInference must be false');
  }
  if (integration.storeModelHashWithMask !== true) {
    throw new Error('integration.storeModelHashWithMask must be true');
  }
  if (integration.fallbackPolicy !== 'none') throw new Error('integration.fallbackPolicy must be none');
  if (integration.maskVersionMethod !== 'ml-combo-v1') {
    throw new Error('integration.maskVersionMethod must be ml-combo-v1');
  }
  const imageCount = requirePositiveNumber(metrics.imageCount, 'metrics.imageCount');

  return {
    schemaVersion: 2,
    family: 'sam-crux-combo',
    method: 'ml-combo-v1',
    segmentationPrimitive: {
      family: 'sam-family',
      name: requireString(primitive.name, 'segmentationPrimitive.name'),
      frozen: true,
      prompt: typeof primitive.prompt === 'string' ? primitive.prompt : undefined,
    },
    files: {
      cruxHeads,
      samPrimitive: isRecord(files.samPrimitive)
        ? {
            path: requireString(files.samPrimitive.path, 'files.samPrimitive.path'),
            sha256: typeof files.samPrimitive.sha256 === 'string' ? files.samPrimitive.sha256 : undefined,
            bytes: typeof files.samPrimitive.bytes === 'number' ? files.samPrimitive.bytes : undefined,
            artifactType:
              files.samPrimitive.artifactType === 'file' ||
              files.samPrimitive.artifactType === 'directory' ||
              files.samPrimitive.artifactType === 'external-missing'
                ? files.samPrimitive.artifactType
                : undefined,
          }
        : undefined,
      datasetManifest: isRecord(files.datasetManifest)
        ? parseHashReference(files.datasetManifest, 'files.datasetManifest')
        : undefined,
      evalSummary: isRecord(files.evalSummary)
        ? parseHashReference(files.evalSummary, 'files.evalSummary')
        : undefined,
      proposalSummary: isRecord(files.proposalSummary)
        ? parseHashReference(files.proposalSummary, 'files.proposalSummary')
        : undefined,
    },
    thresholds: { hold: holdThreshold },
    metrics: {
      imageCount,
      proposalRecall: optionalNumber(metrics.proposalRecall),
      holdProposal: isRecord(metrics.holdProposal)
        ? {
            precision: optionalNumber(metrics.holdProposal.precision),
            recall: optionalNumber(metrics.holdProposal.recall),
            f1: optionalNumber(metrics.holdProposal.f1),
          }
        : undefined,
      allHold: isRecord(metrics.allHold)
        ? {
            recall: optionalNumber(metrics.allHold.recall),
            f1: optionalNumber(metrics.allHold.f1),
          }
        : undefined,
      bestRouteGroupIou: optionalNumber(metrics.bestRouteGroupIou),
      autoRouteIou: optionalNumber(metrics.autoRouteIou),
      runtimeMs: isRecord(metrics.runtimeMs)
        ? {
            p50: optionalNumber(metrics.runtimeMs.p50),
            p90: optionalNumber(metrics.runtimeMs.p90),
          }
        : undefined,
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
    license: isRecord(value.license)
      ? {
          requiresReviewBeforeDistribution:
            typeof value.license.requiresReviewBeforeDistribution === 'boolean'
              ? value.license.requiresReviewBeforeDistribution
              : undefined,
          notes: typeof value.license.notes === 'string' ? value.license.notes : undefined,
        }
      : undefined,
  };
}

function parseModelArtifact(value: unknown, field: string): ModelArtifact {
  const artifact = requireRecord(value, field);
  const artifactType = artifact.artifactType;
  if (artifactType !== 'file' && artifactType !== 'directory') {
    throw new Error(`${field}.artifactType must be file or directory`);
  }
  return {
    path: requireString(artifact.path, `${field}.path`),
    sha256: requireSha256(artifact.sha256, `${field}.sha256`),
    bytes: requirePositiveNumber(artifact.bytes, `${field}.bytes`),
    artifactType,
  };
}

function parseHashReference(value: unknown, field: string): HashReference {
  const reference = requireRecord(value, field);
  return {
    path: requireString(reference.path, `${field}.path`),
    sha256: requireSha256(reference.sha256, `${field}.sha256`),
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireSha256(value: unknown, field: string): string {
  const hash = requireString(value, field);
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error(`${field} must be a SHA-256 hex digest`);
  return hash.toLowerCase();
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
