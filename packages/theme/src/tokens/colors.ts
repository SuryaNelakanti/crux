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

    // Neutrals (Zinc scale)
    gray50: '#FAFAFA',
    gray100: '#F4F4F5',
    gray200: '#E4E4E7',
    gray300: '#D4D4D8',
    gray400: '#A1A1AA',
    gray500: '#71717A',
    gray600: '#52525B',
    gray700: '#3F3F46',
    gray800: '#27272A',
    gray900: '#18181B',
    gray950: '#09090B',

    // Brand - Warm Orange/Coral (climbing energy)
    orange50: '#FFF7ED',
    orange100: '#FFEDD5',
    orange200: '#FED7AA',
    orange300: '#FDBA74',
    orange400: '#FB923C',
    orange500: '#F97316',
    orange600: '#EA580C',
    orange700: '#C2410C',
    orange800: '#9A3412',
    orange900: '#7C2D12',

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
