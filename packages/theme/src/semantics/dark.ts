import { palette } from '../tokens/colors';

/**
 * Dark theme semantic color mappings
 *
 * Inverted mappings for dark mode.
 * Same semantic names, different palette values.
 */
export const darkColors = {
  // Backgrounds
  bgCanvas: palette.gray950,
  bgSurface: palette.gray900,
  bgSurfaceRaised: palette.gray800,
  bgSurfacePressed: palette.gray700,
  bgMuted: palette.gray800,
  bgInverse: palette.gray50,

  // Text
  textPrimary: palette.gray50,
  textSecondary: palette.gray400,
  textMuted: palette.gray500,
  textInverse: palette.gray900,
  textBrand: palette.teal300,
  textLink: palette.teal300,

  // Brand/Accent
  accentBrand: palette.teal400,
  accentBrandHover: palette.teal300,
  accentBrandPressed: palette.teal500,
  accentBrandMuted: palette.teal900,
  accentBrandSubtle: palette.teal900,

  // Interactive states
  interactiveDefault: palette.gray50,
  interactiveHover: palette.gray200,
  interactivePressed: palette.gray100,
  interactiveDisabled: palette.gray700,

  // Semantic status colors
  statusSuccess: palette.emerald400,
  statusSuccessMuted: palette.emerald600,
  statusSuccessSubtle: palette.emerald600,
  statusWarning: palette.amber400,
  statusWarningMuted: palette.amber600,
  statusWarningSubtle: palette.amber600,
  statusError: palette.red400,
  statusErrorMuted: palette.red600,
  statusErrorSubtle: palette.red600,
  statusInfo: palette.sky400,
  statusInfoMuted: palette.sky600,
  statusInfoSubtle: palette.sky600,

  // Borders
  borderDefault: palette.gray700,
  borderMuted: palette.gray800,
  borderStrong: palette.gray600,
  borderFocus: palette.teal400,
  borderError: palette.red500,

  // Icons
  iconPrimary: palette.gray300,
  iconSecondary: palette.gray400,
  iconMuted: palette.gray500,
  iconInverse: palette.gray900,
  iconBrand: palette.teal300,

  // Overlays
  overlaySubtle: 'rgba(255, 255, 255, 0.04)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',
  overlayMedium: 'rgba(0, 0, 0, 0.4)',
  overlayHeavy: 'rgba(0, 0, 0, 0.7)',
  overlayScrim: 'rgba(0, 0, 0, 0.9)',

  // Skeleton
  skeletonBase: palette.gray800,
  skeletonHighlight: palette.gray700,

  // Special
  transparent: palette.transparent,
  white: palette.white,
  black: palette.black,
} as const;
