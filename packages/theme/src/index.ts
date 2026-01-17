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

// Themes
export { lightTheme, darkTheme, themes } from './themes';
export type { Theme, ThemeName } from './themes';

// Tokens (for packages/ui and internal use)
export {
    spacing,
    borderRadii,
    zIndices,
    type Spacing,
    type BorderRadius,
    type ZIndex,
} from './tokens/spacing';

export {
    fontFamilies,
    fontWeights,
    textVariants,
    type FontFamily,
    type FontWeight,
    type TextVariant,
} from './tokens/typography';

export {
    elevation,
    blurs,
    overlays,
    type ElevationLevel,
    type BlurLevel,
    type OverlayLevel,
} from './tokens/elevation';

// Semantic colors type (for type checking, not values)
export type { SemanticColor } from './semantics/light';

// Motion system
export {
    durations,
    getDurationSeconds,
    type Duration,
} from './motion/durations';

export {
    easing,
    type EasingName,
} from './motion/easing';

export {
    springs,
    type SpringName,
    type SpringConfig,
} from './motion/springs';

export {
    patterns,
    type PatternName,
    type Pattern,
} from './motion/patterns';

export {
    haptics,
    triggerHaptic,
    type HapticType,
} from './motion/haptics';
