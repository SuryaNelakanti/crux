import { palette } from '../tokens/colors';

/**
 * Light theme semantic color mappings
 * 
 * Maps semantic color names to palette values.
 * UI code uses semantic names like 'bgCanvas', never 'gray50'.
 */
export const lightColors = {
    // Backgrounds
    bgCanvas: palette.white,
    bgSurface: palette.gray50,
    bgSurfaceRaised: palette.white,
    bgSurfacePressed: palette.gray100,
    bgMuted: palette.gray100,
    bgInverse: palette.gray900,

    // Text
    textPrimary: palette.gray900,
    textSecondary: palette.gray600,
    textMuted: palette.gray400,
    textInverse: palette.white,
    textBrand: palette.orange600,
    textLink: palette.orange600,

    // Brand/Accent
    accentBrand: palette.orange500,
    accentBrandHover: palette.orange600,
    accentBrandPressed: palette.orange700,
    accentBrandMuted: palette.orange100,
    accentBrandSubtle: palette.orange50,

    // Interactive states
    interactiveDefault: palette.gray900,
    interactiveHover: palette.gray700,
    interactivePressed: palette.gray800,
    interactiveDisabled: palette.gray300,

    // Semantic status colors
    statusSuccess: palette.emerald500,
    statusSuccessMuted: palette.emerald100,
    statusSuccessSubtle: palette.emerald50,
    statusWarning: palette.amber500,
    statusWarningMuted: palette.amber100,
    statusWarningSubtle: palette.amber50,
    statusError: palette.red500,
    statusErrorMuted: palette.red100,
    statusErrorSubtle: palette.red50,
    statusInfo: palette.sky500,
    statusInfoMuted: palette.sky100,
    statusInfoSubtle: palette.sky50,

    // Borders
    borderDefault: palette.gray200,
    borderMuted: palette.gray100,
    borderStrong: palette.gray300,
    borderFocus: palette.orange500,
    borderError: palette.red500,

    // Icons
    iconPrimary: palette.gray700,
    iconSecondary: palette.gray500,
    iconMuted: palette.gray400,
    iconInverse: palette.white,
    iconBrand: palette.orange500,

    // Overlays
    overlaySubtle: 'rgba(0, 0, 0, 0.04)',
    overlayLight: 'rgba(0, 0, 0, 0.1)',
    overlayMedium: 'rgba(0, 0, 0, 0.2)',
    overlayHeavy: 'rgba(0, 0, 0, 0.6)',
    overlayScrim: 'rgba(0, 0, 0, 0.8)',

    // Skeleton
    skeletonBase: palette.gray200,
    skeletonHighlight: palette.gray100,

    // Special
    transparent: palette.transparent,
    white: palette.white,
    black: palette.black,
} as const;

export type SemanticColor = keyof typeof lightColors;
