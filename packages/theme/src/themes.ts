import { createTheme } from '@shopify/restyle';
import { darkColors, lightColors } from './semantics';
import { borderRadii, spacing, zIndices } from './tokens/spacing';
import { textVariants } from './tokens/typography';

/**
 * Base theme configuration shared by all themes
 */
const baseTheme = {
  spacing,
  borderRadii,
  zIndices,
  textVariants,
  breakpoints: {
    phone: 0,
    tablet: 768,
    largeTablet: 1024,
  },
};

/**
 * Light theme
 */
export const lightTheme = createTheme({
  ...baseTheme,
  colors: lightColors,
});

/**
 * Dark theme
 */
export const darkTheme = createTheme({
  ...baseTheme,
  colors: darkColors,
});

/**
 * Theme registry
 */
export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

/**
 * Theme types
 */
export type Theme = typeof lightTheme;
export type ThemeName = keyof typeof themes;
