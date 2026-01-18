/**
 * Elevation tokens
 *
 * Shadows, blurs, and overlays for depth and layering.
 */

export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  low: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  high: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  overlay: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 16,
  },
} as const;

export type ElevationLevel = keyof typeof elevation;

/**
 * Blur values (for backdrop filters)
 */
export const blurs = {
  none: 0,
  subtle: 4,
  medium: 12,
  strong: 24,
  overlay: 40,
} as const;

export type BlurLevel = keyof typeof blurs;

/**
 * Overlay colors (for scrims and backdrops)
 */
export const overlays = {
  subtle: 'rgba(0, 0, 0, 0.04)',
  light: 'rgba(0, 0, 0, 0.1)',
  medium: 'rgba(0, 0, 0, 0.2)',
  heavy: 'rgba(0, 0, 0, 0.6)',
  scrim: 'rgba(0, 0, 0, 0.8)',
} as const;

export type OverlayLevel = keyof typeof overlays;
