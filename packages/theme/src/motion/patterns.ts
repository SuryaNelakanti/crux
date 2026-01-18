import { durations } from './durations';
import type { HapticType } from './haptics';
import { springs } from './springs';

/**
 * Choreography patterns
 *
 * Predefined animation recipes for common UI patterns.
 * These combine duration, easing/spring, and other motion properties.
 */
export const patterns = {
  /** Screen enter (fade + slide up) */
  screenEnter: {
    duration: durations.moderate,
    initialOffset: 24,
    initialOpacity: 0,
    finalOffset: 0,
    finalOpacity: 1,
  },

  /** Screen exit (fade + slide up slightly) */
  screenExit: {
    duration: durations.fast,
    initialOffset: 0,
    initialOpacity: 1,
    finalOffset: -12,
    finalOpacity: 0,
  },

  /** Card lift (press feedback) */
  cardLift: {
    spring: springs.snappy,
    pressedScale: 0.98,
    pressedOpacity: 0.95,
  },

  /** Bottom sheet open */
  bottomSheetOpen: {
    spring: springs.default,
    scrimOpacity: 0.5,
    initialTranslateY: '100%',
  },

  /** Bottom sheet close */
  bottomSheetClose: {
    spring: springs.stiff,
    scrimOpacity: 0,
    velocityThreshold: 500,
  },

  /** List item insert */
  listItemInsert: {
    duration: durations.normal,
    initialHeight: 0,
    initialOpacity: 0,
    staggerDelay: 50,
  },

  /** List item remove */
  listItemRemove: {
    duration: durations.fast,
    finalHeight: 0,
    finalOpacity: 0,
  },

  /** Button press */
  buttonPress: {
    spring: springs.snappy,
    pressedScale: 0.96,
    haptic: 'light' as HapticType,
  },

  /** Icon button press (smaller scale) */
  iconButtonPress: {
    spring: springs.snappy,
    pressedScale: 0.9,
    haptic: 'light' as HapticType,
  },

  /** Success celebration */
  success: {
    spring: springs.bouncy,
    scale: 1.05,
    haptic: 'success' as HapticType,
  },

  /** Error shake */
  error: {
    duration: durations.normal,
    shakeDistance: 8,
    shakeCount: 3,
    haptic: 'error' as HapticType,
  },

  /** Skeleton shimmer */
  shimmer: {
    duration: durations.slowest,
    delay: 0,
  },

  /** Fade in */
  fadeIn: {
    duration: durations.normal,
    initialOpacity: 0,
    finalOpacity: 1,
  },

  /** Fade out */
  fadeOut: {
    duration: durations.fast,
    initialOpacity: 1,
    finalOpacity: 0,
  },

  /** Scale in (from smaller) */
  scaleIn: {
    spring: springs.default,
    initialScale: 0.9,
    initialOpacity: 0,
    finalScale: 1,
    finalOpacity: 1,
  },

  /** Modal enter */
  modalEnter: {
    spring: springs.default,
    initialScale: 0.95,
    initialOpacity: 0,
    scrimOpacity: 0.5,
  },

  /** Modal exit */
  modalExit: {
    duration: durations.fast,
    finalScale: 0.95,
    finalOpacity: 0,
  },

  /** Tab switch */
  tabSwitch: {
    spring: springs.snappy,
    haptic: 'selection' as HapticType,
  },
} as const;

export type PatternName = keyof typeof patterns;
export type Pattern = (typeof patterns)[PatternName];
