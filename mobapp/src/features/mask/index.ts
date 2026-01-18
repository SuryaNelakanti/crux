/**
 * Mask feature module
 *
 * Handles mask generation and editing:
 * - Auto-generate mask from photo
 * - Manual mask editing (brush add/remove)
 * - Seed color selection
 * - Mask versioning
 */
export {
  createBlankMaskForProblem,
  generateAutoMaskForProblem,
  generateSeedMaskForProblem,
  getActiveRouteMaskForProblem,
  saveEditedMaskForProblem,
} from './actions';
export {
  applyBrushToMask,
  buildMaskRgba,
  createMaskImage,
  loadMaskPixels,
  maskTint,
} from './processing';
