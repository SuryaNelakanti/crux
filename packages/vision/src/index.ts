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

// Hold detection
export { detectHolds, type HoldCandidate, type HoldDetectionResult } from './holds';
export {
  detectHoldsContrast,
  type ContrastDetectionParams,
  type ContrastDetectionResult,
  type ContrastHoldCandidate,
} from './holds/contrast';

