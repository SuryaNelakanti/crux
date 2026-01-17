import React from 'react';
import Animated, {
    useAnimatedStyle,
    withTiming,
} from 'react-native-reanimated';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { durations } from '@crux/theme';

// ============================================================================
// Types
// ============================================================================

export interface ProgressProps {
    /** Progress value (0-100) */
    value: number;
    /** Optional label */
    label?: string;
    /** Show percentage text */
    showPercentage?: boolean;
    /** Height of the bar */
    height?: number;
}

// ============================================================================
// Component
// ============================================================================

const AnimatedBox = Animated.createAnimatedComponent(Box);

/**
 * Progress component
 * 
 * Animated progress bar.
 * 
 * @example
 * <Progress value={75} label="Completion" showPercentage />
 */
export function Progress({
    value,
    label,
    showPercentage = false,
    height = 8,
}: ProgressProps) {
    const clampedValue = Math.min(100, Math.max(0, value));

    const animatedStyle = useAnimatedStyle(() => ({
        width: withTiming(`${clampedValue}%`, { duration: durations.moderate }),
    }));

    return (
        <Box gap="xs">
            {(label || showPercentage) && (
                <Box flexDirection="row" justifyContent="space-between">
                    {label && (
                        <Text variant="labelSmall" color="textSecondary">
                            {label}
                        </Text>
                    )}
                    {showPercentage && (
                        <Text variant="statSmall" color="textPrimary">
                            {Math.round(clampedValue)}%
                        </Text>
                    )}
                </Box>
            )}
            <Box
                backgroundColor="bgMuted"
                borderRadius="full"
                overflow="hidden"
                height={height}
            >
                <AnimatedBox
                    style={animatedStyle}
                    backgroundColor="accentBrand"
                    height={height}
                    borderRadius="full"
                />
            </Box>
        </Box>
    );
}
