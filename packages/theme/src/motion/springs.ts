/**
 * Spring configuration tokens
 *
 * Physics-based spring presets for react-native-reanimated.
 * Springs feel more natural than timed animations for interactive elements.
 */
export const springs = {
  /** Soft - gentle, fluid (large elements, sheets) */
  soft: {
    damping: 20,
    stiffness: 100,
    mass: 1,
  },

  /** Default - balanced (most UI elements) */
  default: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },

  /** Snappy - quick, responsive (buttons, toggles) */
  snappy: {
    damping: 20,
    stiffness: 300,
    mass: 0.8,
  },

  /** Bouncy - playful (success states, celebrations) */
  bouncy: {
    damping: 10,
    stiffness: 200,
    mass: 1,
  },

  /** Stiff - minimal overshoot (precision interactions) */
  stiff: {
    damping: 25,
    stiffness: 400,
    mass: 1,
  },

  /** Gentle - slow and smooth (hero transitions) */
  gentle: {
    damping: 20,
    stiffness: 80,
    mass: 1,
  },
} as const;

export type SpringName = keyof typeof springs;
export type SpringConfig = (typeof springs)[SpringName];
