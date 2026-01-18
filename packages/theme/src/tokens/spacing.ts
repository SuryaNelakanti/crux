/**
 * Spacing tokens
 * Use these for all margin, padding, and gap values.
 * Never use raw numbers in UI code.
 */
export const spacing = {
  none: 0,
  '2xs': 2,
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export type Spacing = keyof typeof spacing;

/**
 * Border radii tokens
 */
export const borderRadii = {
  none: 0,
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  full: 9999,
} as const;

export type BorderRadius = keyof typeof borderRadii;

/**
 * Z-index layers
 */
export const zIndices = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  modal: 1200,
  popover: 1300,
  tooltip: 1400,
  toast: 1500,
} as const;

export type ZIndex = keyof typeof zIndices;
