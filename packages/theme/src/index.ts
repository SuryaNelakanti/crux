/**
 * @crux/theme
 *
 * Design system tokens for Crux app.
 *
 * Usage:
 * - ThemeProvider at app root
 * - Box, Text from @crux/ui (not from here)
 * - Import only what you need
 *
 * Rules:
 * - Screens must NOT import from tokens/colors.ts
 * - Use semantic colors from theme
 * - Use motion tokens, not hardcoded values
 */

// Restyle core
export { ThemeProvider, useTheme } from '@shopify/restyle';
// Motion system
export {
  type Duration,
  durations,
  getDurationSeconds,
} from './motion/durations';
export {
  type EasingName,
  easing,
} from './motion/easing';
export {
  type HapticType,
  haptics,
  triggerHaptic,
} from './motion/haptics';
export {
  type Pattern,
  type PatternName,
  patterns,
} from './motion/patterns';
export {
  type SpringConfig,
  type SpringName,
  springs,
} from './motion/springs';

// Semantic colors type (for type checking, not values)
export type { SemanticColor } from './semantics/light';
export type { Theme, ThemeName } from './themes';
// Themes
export { darkTheme, lightTheme, themes } from './themes';
export {
  type BlurLevel,
  blurs,
  type ElevationLevel,
  elevation,
  type OverlayLevel,
  overlays,
} from './tokens/elevation';
// Tokens (for packages/ui and internal use)
export {
  type BorderRadius,
  borderRadii,
  type Spacing,
  spacing,
  type ZIndex,
  zIndices,
} from './tokens/spacing';
export {
  type FontFamily,
  type FontWeight,
  fontFamilies,
  fontWeights,
  type TextVariant,
  textVariants,
} from './tokens/typography';
