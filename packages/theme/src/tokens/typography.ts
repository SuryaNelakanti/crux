/**
 * Typography tokens
 * 
 * Font families, weights, and text variants for Restyle.
 * UI code should use textVariants, never raw fontSize.
 */

export const fontFamilies = {
    sans: 'AvenirNext-Regular',
    sansMedium: 'AvenirNext-Medium',
    sansSemiBold: 'AvenirNext-DemiBold',
    sansBold: 'AvenirNext-Bold',
    mono: 'SFMono-Regular',
} as const;

export type FontFamily = keyof typeof fontFamilies;

export const fontWeights = {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
};

export type FontWeight = keyof typeof fontWeights;

/**
 * Text variants for Restyle
 * 
 * Usage: <Text variant="headingLarge">Hello</Text>
 */
export const textVariants = {
    defaults: {
        fontFamily: fontFamilies.sans,
        color: 'textPrimary',
    },

    // Display (hero text)
    displayLarge: {
        fontFamily: fontFamilies.sansBold,
        fontSize: 48,
        lineHeight: 56,
        letterSpacing: -1.5,
    },
    displayMedium: {
        fontFamily: fontFamilies.sansBold,
        fontSize: 36,
        lineHeight: 44,
        letterSpacing: -1,
    },
    displaySmall: {
        fontFamily: fontFamilies.sansBold,
        fontSize: 30,
        lineHeight: 38,
        letterSpacing: -0.75,
    },

    // Headings
    headingLarge: {
        fontFamily: fontFamilies.sansSemiBold,
        fontSize: 28,
        lineHeight: 36,
        letterSpacing: -0.5,
    },
    headingMedium: {
        fontFamily: fontFamilies.sansSemiBold,
        fontSize: 22,
        lineHeight: 28,
        letterSpacing: -0.25,
    },
    headingSmall: {
        fontFamily: fontFamilies.sansSemiBold,
        fontSize: 18,
        lineHeight: 24,
        letterSpacing: 0,
    },

    // Body text
    bodyLarge: {
        fontFamily: fontFamilies.sans,
        fontSize: 16,
        lineHeight: 24,
        letterSpacing: 0,
    },
    bodyMedium: {
        fontFamily: fontFamilies.sans,
        fontSize: 14,
        lineHeight: 20,
        letterSpacing: 0.1,
    },
    bodySmall: {
        fontFamily: fontFamilies.sans,
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0.2,
    },

    // Labels (buttons, chips, tags)
    labelLarge: {
        fontFamily: fontFamilies.sansMedium,
        fontSize: 14,
        lineHeight: 20,
        letterSpacing: 0.1,
    },
    labelMedium: {
        fontFamily: fontFamilies.sansMedium,
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0.25,
    },
    labelSmall: {
        fontFamily: fontFamilies.sansMedium,
        fontSize: 10,
        lineHeight: 14,
        letterSpacing: 0.4,
    },

    // Stats (tabular numbers for data display)
    statLarge: {
        fontFamily: fontFamilies.sansSemiBold,
        fontSize: 32,
        lineHeight: 40,
        letterSpacing: -0.5,
        fontVariant: ['tabular-nums' as const],
    },
    statMedium: {
        fontFamily: fontFamilies.sansSemiBold,
        fontSize: 24,
        lineHeight: 32,
        letterSpacing: 0,
        fontVariant: ['tabular-nums' as const],
    },
    statSmall: {
        fontFamily: fontFamilies.sansMedium,
        fontSize: 14,
        lineHeight: 20,
        fontVariant: ['tabular-nums' as const],
    },

    // Code/mono
    code: {
        fontFamily: fontFamilies.mono,
        fontSize: 13,
        lineHeight: 20,
        letterSpacing: 0,
    },
} as const;

export type TextVariant = keyof typeof textVariants;
