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
    generateAutoMaskForProblem,
    generateSeedMaskForProblem,
    saveEditedMaskForProblem,
    createBlankMaskForProblem,
    getActiveRouteMaskForProblem,
} from './actions';
export {
    applyBrushToMask,
    buildMaskRgba,
    createMaskImage,
    loadMaskPixels,
    maskTint,
} from './processing';
