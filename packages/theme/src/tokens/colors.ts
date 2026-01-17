/**
 * Raw color palettes
 * 
 * ⚠️ INTERNAL ONLY - Do not import in UI components!
 * UI code should use semantic colors from the theme.
 */
export const palette = {
    // Pure
    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',

    // Neutrals (cool slate)
    gray50: '#F7F8FA',
    gray100: '#EDF0F4',
    gray200: '#DDE3EA',
    gray300: '#C7CFD9',
    gray400: '#9BA6B2',
    gray500: '#778390',
    gray600: '#5B6470',
    gray700: '#3F4650',
    gray800: '#2B3139',
    gray900: '#1F2329',
    gray950: '#111419',

    // Brand - Alpine Teal
    teal50: '#E6FBF7',
    teal100: '#C8F4ED',
    teal200: '#9EE8DE',
    teal300: '#6AD9CC',
    teal400: '#3FC6B8',
    teal500: '#1BAFA1',
    teal600: '#168D82',
    teal700: '#116C61',
    teal800: '#0B4C45',
    teal900: '#07332E',

    // Success - Emerald
    emerald50: '#ECFDF5',
    emerald100: '#D1FAE5',
    emerald400: '#34D399',
    emerald500: '#10B981',
    emerald600: '#059669',

    // Warning - Amber
    amber50: '#FFFBEB',
    amber100: '#FEF3C7',
    amber400: '#FBBF24',
    amber500: '#F59E0B',
    amber600: '#D97706',

    // Error - Red
    red50: '#FEF2F2',
    red100: '#FEE2E2',
    red400: '#F87171',
    red500: '#EF4444',
    red600: '#DC2626',

    // Info - Sky
    sky50: '#F0F9FF',
    sky100: '#E0F2FE',
    sky400: '#38BDF8',
    sky500: '#0EA5E9',
    sky600: '#0284C7',
} as const;

export type PaletteColor = keyof typeof palette;
