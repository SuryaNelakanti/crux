import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import type { Theme } from '@crux/theme';

// ============================================================================
// Types
// ============================================================================

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';
export type BadgeSize = 'small' | 'medium';

export interface BadgeProps {
    /** Badge text */
    label: string;
    /** Visual variant */
    variant?: BadgeVariant;
    /** Size preset */
    size?: BadgeSize;
}

// ============================================================================
// Helpers
// ============================================================================

const getColors = (variant: BadgeVariant): { bg: keyof Theme['colors']; text: keyof Theme['colors'] } => {
    switch (variant) {
        case 'success':
            return { bg: 'statusSuccessMuted', text: 'statusSuccess' };
        case 'warning':
            return { bg: 'statusWarningMuted', text: 'statusWarning' };
        case 'error':
            return { bg: 'statusErrorMuted', text: 'statusError' };
        case 'info':
            return { bg: 'statusInfoMuted', text: 'statusInfo' };
        case 'brand':
            return { bg: 'accentBrandMuted', text: 'accentBrand' };
        case 'default':
        default:
            return { bg: 'bgMuted', text: 'textSecondary' };
    }
};

// ============================================================================
// Component
// ============================================================================

/**
 * Badge component
 * 
 * Small label for status indicators.
 * 
 * @example
 * <Badge label="Flash" variant="success" />
 */
export function Badge({
    label,
    variant = 'default',
    size = 'medium',
}: BadgeProps) {
    const colors = getColors(variant);
    const isSmall = size === 'small';

    return (
        <Box
            backgroundColor={colors.bg}
            paddingHorizontal={isSmall ? 'xs' : 's'}
            paddingVertical={isSmall ? '2xs' : 'xs'}
            borderRadius="full"
            borderWidth={1}
            borderColor={variant === 'default' ? 'borderMuted' : colors.text}
            alignSelf="flex-start"
        >
            <Text
                variant={isSmall ? 'labelSmall' : 'labelMedium'}
                color={colors.text}
            >
                {label}
            </Text>
        </Box>
    );
}
