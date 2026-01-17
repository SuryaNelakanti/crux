import React from 'react';
import { Image, Pressable, type ImageSourcePropType } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@shopify/restyle';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { Badge, type BadgeVariant } from './Badge';
import { springs, patterns, triggerHaptic, type Theme } from '@crux/theme';

// ============================================================================
// Types
// ============================================================================

export type ProblemOutcome = 'flash' | 'send' | 'tried' | 'project' | null;

export interface ProblemCardProps {
    /** Photo source */
    imageSource: ImageSourcePropType;
    /** Mask overlay source (optional) */
    maskSource?: ImageSourcePropType;
    /** Show mask overlay */
    showMask?: boolean;
    /** User's outcome for this problem */
    outcome?: ProblemOutcome;
    /** Grade label (e.g., "V4-V5") */
    gradeLabel?: string;
    /** Attempts count */
    attempts?: number;
    /** Press handler */
    onPress?: () => void;
    /** Compact mode for lists */
    compact?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const getOutcomeBadge = (outcome: ProblemOutcome | undefined): { label: string; variant: BadgeVariant } | null => {
    switch (outcome) {
        case 'flash':
            return { label: '⚡ Flash', variant: 'success' };
        case 'send':
            return { label: '✓ Send', variant: 'success' };
        case 'tried':
            return { label: '○ Tried', variant: 'warning' };
        case 'project':
            return { label: '★ Project', variant: 'brand' };
        default:
            return null;
    }
};

const AnimatedBox = Animated.createAnimatedComponent(Box);

// ============================================================================
// Component
// ============================================================================

/**
 * ProblemCard component
 * 
 * Product primitive: displays a problem with photo, optional mask overlay,
 * outcome badge, and metadata.
 * 
 * @example
 * <ProblemCard
 *   imageSource={{ uri: problemPhoto }}
 *   maskSource={{ uri: maskUri }}
 *   showMask={true}
 *   outcome="send"
 *   gradeLabel="V4"
 *   onPress={() => navigateToProblem(id)}
 * />
 */
export function ProblemCard({
    imageSource,
    maskSource,
    showMask = false,
    outcome,
    gradeLabel,
    attempts,
    onPress,
    compact = false,
}: ProblemCardProps) {
    const theme = useTheme<Theme>();
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withSpring(patterns.cardLift.pressedScale, springs.snappy);
        triggerHaptic('light');
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, springs.snappy);
    };

    const outcomeBadge = getOutcomeBadge(outcome);
    const imageHeight = compact ? 140 : 220;

    return (
        <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={onPress}
            accessibilityRole="button"
        >
            <AnimatedBox
                style={animatedStyle}
                backgroundColor="bgSurfaceRaised"
                borderRadius="l"
                overflow="hidden"
                borderWidth={1}
                borderColor="borderMuted"
                shadowColor={theme.colors.black}
                shadowOffset={{ width: 0, height: 10 }}
                shadowOpacity={0.12}
                shadowRadius={16}
                elevation={4}
            >
                {/* Image container */}
                <Box position="relative" height={imageHeight}>
                    <Image
                        source={imageSource}
                        style={{
                            width: '100%',
                            height: '100%',
                        }}
                        resizeMode="cover"
                    />

                    {/* Mask overlay */}
                    {showMask && maskSource && (
                        <Box
                            position="absolute"
                            top={0}
                            left={0}
                            right={0}
                            bottom={0}
                        >
                            <Image
                                source={maskSource}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0.55,
                                }}
                                resizeMode="cover"
                            />
                        </Box>
                    )}

                    {/* Top badges */}
                    <Box position="absolute" top={10} left={10} flexDirection="row" gap="xs">
                        {showMask && maskSource && (
                            <Badge label="Mask" variant="brand" size="small" />
                        )}
                    </Box>
                    {outcomeBadge && (
                        <Box position="absolute" top={10} right={10}>
                            <Badge
                                label={outcomeBadge.label}
                                variant={outcomeBadge.variant}
                                size="small"
                            />
                        </Box>
                    )}

                    {/* Bottom overlay */}
                    {(gradeLabel || attempts !== undefined) && (
                        <Box
                            position="absolute"
                            left={0}
                            right={0}
                            bottom={0}
                            padding="s"
                            backgroundColor="overlayLight"
                        >
                            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                                {gradeLabel && (
                                    <Text variant="labelLarge" color="textPrimary">
                                        {gradeLabel}
                                    </Text>
                                )}
                                {attempts !== undefined && (
                                    <Text variant="labelMedium" color="textSecondary">
                                        {attempts} {attempts === 1 ? 'attempt' : 'attempts'}
                                    </Text>
                                )}
                            </Box>
                        </Box>
                    )}
                </Box>

                {/* Metadata */}
                {!compact && outcomeBadge && (
                    <Box padding="m">
                        <Text variant="bodySmall" color="textSecondary">
                            Tap to edit log and mask
                        </Text>
                    </Box>
                )}
            </AnimatedBox>
        </Pressable>
    );
}
