import { Easing } from 'react-native-reanimated';

/**
 * Easing curve tokens
 *
 * Named presets for consistent motion feel.
 * Rule: No hardcoded bezier curves in screens!
 */
export const easing = {
  /** Linear (for progress bars, shimmer) */
  linear: Easing.linear,

  /** Emphasized decelerate (fast in, slow out) - for entrances */
  emphasizedDecelerate: Easing.bezier(0.05, 0.7, 0.1, 1.0),

  /** Emphasized accelerate (slow in, fast out) - for exits */
  emphasizedAccelerate: Easing.bezier(0.3, 0.0, 0.8, 0.15),

  /** Standard (balanced) - for state changes */
  standard: Easing.bezier(0.2, 0.0, 0.0, 1.0),

  /** Standard decelerate */
  standardDecelerate: Easing.bezier(0.0, 0.0, 0.0, 1.0),

  /** Standard accelerate */
  standardAccelerate: Easing.bezier(0.3, 0.0, 1.0, 1.0),

  /** Bounce (for playful feedback) */
  bounce: Easing.bezier(0.34, 1.56, 0.64, 1),

  /** Sharp (for quick snappy interactions) */
  sharp: Easing.bezier(0.4, 0.0, 0.6, 1.0),

  /** Ease out (smooth deceleration) */
  easeOut: Easing.bezier(0.0, 0.0, 0.2, 1.0),

  /** Ease in (gradual acceleration) */
  easeIn: Easing.bezier(0.4, 0.0, 1.0, 1.0),

  /** Ease in-out (symmetric) */
  easeInOut: Easing.bezier(0.4, 0.0, 0.2, 1.0),
} as const;

export type EasingName = keyof typeof easing;
