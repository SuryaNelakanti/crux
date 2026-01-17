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
    rgbToHsl,
    hslToRgb,
    rgbToLab,
    colorDistanceLab,
    colorDistanceRgb,
    isSaturated,
    getDominantHue,
    type RGB,
    type HSL,
    type LAB,
} from './color';

// Mask generation
export {
    generateMask,
    clusterColors,
    scoreCluster,
    cleanupMask,
    calculateConfidence,
    type MaskGenerationInput,
    type MaskGenerationResult,
    type ColorCluster,
} from './mask';
