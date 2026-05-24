/**
 * @crux/vision
 *
 * Image processing and mask generation for Crux app.
 *
 * Rules:
 * - Pure functions only (no side effects)
 * - No React, no Expo, no platform APIs
 * - Deterministic outputs (same input = same output)
 * - Unit-testable with fixtures
 */

export {
  type BinaryMaskMetrics,
  bestMaskIoU,
  calculateBinaryMaskMetrics,
  calculateComponentRecall,
  type Point,
  type Polygon,
  percentile,
  rasterizePolygons,
  scalePolygon,
  unionMasks,
} from './benchmark';
// Color utilities
export {
  colorDistanceLab,
  colorDistanceRgb,
  getDominantHue,
  type HSL,
  hslToRgb,
  isSaturated,
  type LAB,
  type RGB,
  rgbToHsl,
  rgbToLab,
} from './color';
export {
  getRouteLabel,
  parseViaAnnotations,
  type ViaImageAnnotation,
  type ViaRegion,
} from './dataset/via';
// Hold detection
export { detectHolds, type HoldCandidate, type HoldDetectionResult } from './holds';
export {
  type ContrastDetectionParams,
  type ContrastDetectionResult,
  type ContrastHoldCandidate,
  detectHoldsContrast,
} from './holds/contrast';
// Mask generation
export {
  type ColorCluster,
  calculateConfidence,
  cleanupMask,
  clusterColors,
  generateMask,
  type MaskGenerationInput,
  type MaskGenerationResult,
  scoreCluster,
} from './mask';
export {
  type HashReference,
  type ModelArtifact,
  modelMetadataFromCard,
  type RouteMaskModelCard,
  type RouteMaskModelMetadata,
  validateRouteMaskModelCard,
} from './ml/model-card';
export {
  buildRouteMaskForGroup,
  generateRouteMask,
  groupHoldsByColor,
  type RouteHoldGroup,
  type RouteMaskGenerationInput,
  type RouteMaskGenerationResult,
} from './route';
