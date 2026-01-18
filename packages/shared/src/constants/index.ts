/**
 * Shared constants for Crux
 */

// ============================================================================
// Grade Scales
// ============================================================================

/**
 * V-scale grades (commonly used in US bouldering)
 * Value represents normalized difficulty (0 = VB, 1 = V0, etc.)
 */
export const V_SCALE_GRADES = [
  { value: 0, label: 'VB' },
  { value: 1, label: 'V0' },
  { value: 2, label: 'V1' },
  { value: 3, label: 'V2' },
  { value: 4, label: 'V3' },
  { value: 5, label: 'V4' },
  { value: 6, label: 'V5' },
  { value: 7, label: 'V6' },
  { value: 8, label: 'V7' },
  { value: 9, label: 'V8' },
  { value: 10, label: 'V9' },
  { value: 11, label: 'V10' },
  { value: 12, label: 'V11' },
  { value: 13, label: 'V12' },
  { value: 14, label: 'V13' },
  { value: 15, label: 'V14' },
  { value: 16, label: 'V15' },
  { value: 17, label: 'V16' },
  { value: 18, label: 'V17' },
] as const;

/**
 * Font scale grades (commonly used in Europe)
 */
export const FONT_SCALE_GRADES = [
  { value: 0, label: '3' },
  { value: 1, label: '4' },
  { value: 2, label: '5' },
  { value: 3, label: '5+' },
  { value: 4, label: '6A' },
  { value: 5, label: '6A+' },
  { value: 6, label: '6B' },
  { value: 7, label: '6B+' },
  { value: 8, label: '6C' },
  { value: 9, label: '6C+' },
  { value: 10, label: '7A' },
  { value: 11, label: '7A+' },
  { value: 12, label: '7B' },
  { value: 13, label: '7B+' },
  { value: 14, label: '7C' },
  { value: 15, label: '7C+' },
  { value: 16, label: '8A' },
  { value: 17, label: '8A+' },
  { value: 18, label: '8B' },
  { value: 19, label: '8B+' },
  { value: 20, label: '8C' },
  { value: 21, label: '8C+' },
  { value: 22, label: '9A' },
] as const;

// ============================================================================
// Outcomes
// ============================================================================

export const OUTCOME_OPTIONS = [
  { value: 'flash', label: 'Flash', description: 'First try, no beta' },
  { value: 'send', label: 'Send', description: 'Completed' },
  { value: 'tried', label: 'Tried', description: 'Attempted but not completed' },
  { value: 'project', label: 'Project', description: 'Saving for later' },
] as const;

// ============================================================================
// Masking
// ============================================================================

/**
 * Minimum confidence threshold for auto-mask.
 * Below this, prompt user for seed color.
 */
export const AUTO_MASK_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Default image compression quality (0-1)
 */
export const IMAGE_COMPRESSION_QUALITY = 0.8;

/**
 * Max image dimension for processing
 */
export const IMAGE_PROCESSING_MAX_WIDTH = 512;

/**
 * Max image dimension for storage
 */
export const IMAGE_STORAGE_MAX_WIDTH = 1920;

// ============================================================================
// Sync
// ============================================================================

/**
 * Maximum retries for outbox items
 */
export const OUTBOX_MAX_RETRIES = 5;

/**
 * Base delay for exponential backoff (ms)
 */
export const OUTBOX_RETRY_BASE_DELAY = 1000;

// ============================================================================
// UI
// ============================================================================

/**
 * Minimum touch target size (points)
 */
export const MIN_TOUCH_TARGET = 44;
