import React, { useEffect } from 'react';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    interpolate,
} from 'react-native-reanimated';
import { useTheme } from '@shopify/restyle';
import { Box, type BoxProps } from '../primitives/Box';
import { durations, type Theme } from '@crux/theme';

// ============================================================================
// Types
// ============================================================================

export interface SkeletonProps extends Omit<BoxProps, 'backgroundColor' | 'width' | 'height'> {
    /** Width (number or string like '100%') */
    width?: number | string;
    /** Height */
    height?: number;
    /** Border radius override */
    borderRadius?: keyof Theme['borderRadii'];
}

// ============================================================================
// Component
// ============================================================================

const AnimatedBox = Animated.createAnimatedComponent(Box);

/**
 * Skeleton component
 * 
 * CRED-style shimmer loading placeholder.
 * 
 * @example
 * <Skeleton width={200} height={24} />
 * <Skeleton width="100%" height={48} borderRadius="m" />
 */
export function Skeleton({
    width = '100%',
    height = 16,
    borderRadius = 's',
    ...boxProps
}: SkeletonProps) {
    const theme = useTheme<Theme>();
    const shimmer = useSharedValue(0);

    useEffect(() => {
        shimmer.value = withRepeat(
            withTiming(1, { duration: durations.slowest * 2 }),
            -1,
            false
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            shimmer.value,
            [0, 0.5, 1],
            [0.3, 0.6, 0.3]
        );

        return {
            opacity,
        };
    });

    return (
        <AnimatedBox
            style={animatedStyle}
            width={width as number}
            height={height}
            backgroundColor="skeletonBase"
            borderRadius={borderRadius}
            overflow="hidden"
            {...boxProps}
        />
    );
}

// ============================================================================
// Preset Skeletons
// ============================================================================

/**
 * Text line skeleton
 */
export function SkeletonText({ lines = 1 }: { lines?: number }) {
    return (
        <Box gap="xs">
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    width={i === lines - 1 && lines > 1 ? '70%' : '100%'}
                    height={14}
                />
            ))}
        </Box>
    );
}

/**
 * Avatar skeleton
 */
export function SkeletonAvatar({ size = 48 }: { size?: number }) {
    return <Skeleton width={size} height={size} borderRadius="full" />;
}

/**
 * Card skeleton
 */
export function SkeletonCard() {
    return (
        <Box backgroundColor="bgSurface" padding="m" borderRadius="m" gap="s">
            <Box flexDirection="row" gap="s" alignItems="center">
                <SkeletonAvatar size={40} />
                <Box flex={1} gap="xs">
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="40%" height={12} />
                </Box>
            </Box>
            <SkeletonText lines={2} />
        </Box>
    );
}
