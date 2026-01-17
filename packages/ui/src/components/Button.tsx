import React from 'react';
import { Pressable, ActivityIndicator, type PressableProps } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@shopify/restyle';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import {
    springs,
    patterns,
    triggerHaptic,
    type Theme,
} from '@crux/theme';

// ============================================================================
// Types
// ============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
    /** Button text */
    label: string;
    /** Visual variant */
    variant?: ButtonVariant;
    /** Size preset */
    size?: ButtonSize;
    /** Disabled state */
    disabled?: boolean;
    /** Loading state (shows spinner) */
    loading?: boolean;
    /** Optional left icon */
    leftIcon?: React.ReactNode;
    /** Optional right icon */
    rightIcon?: React.ReactNode;
    /** Press handler */
    onPress?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const getBackgroundColor = (variant: ButtonVariant, disabled: boolean): keyof Theme['colors'] => {
    if (disabled) return 'interactiveDisabled';
    switch (variant) {
        case 'primary':
            return 'accentBrand';
        case 'secondary':
            return 'bgSurfaceRaised';
        case 'ghost':
            return 'transparent';
        case 'destructive':
            return 'statusError';
        default:
            return 'accentBrand';
    }
};

const getTextColor = (variant: ButtonVariant, disabled: boolean): keyof Theme['colors'] => {
    if (disabled) return 'textMuted';
    switch (variant) {
        case 'primary':
            return 'white';
        case 'secondary':
            return 'textPrimary';
        case 'ghost':
            return 'textPrimary';
        case 'destructive':
            return 'white';
        default:
            return 'white';
    }
};

const getPadding = (size: ButtonSize) => {
    switch (size) {
        case 'small':
            return { paddingVertical: 'xs' as const, paddingHorizontal: 'm' as const };
        case 'medium':
            return { paddingVertical: 's' as const, paddingHorizontal: 'm' as const };
        case 'large':
            return { paddingVertical: 'm' as const, paddingHorizontal: 'xl' as const };
        default:
            return { paddingVertical: 's' as const, paddingHorizontal: 'm' as const };
    }
};

const getMinHeight = (size: ButtonSize): number => {
    switch (size) {
        case 'small':
            return 36;
        case 'medium':
            return 44;
        case 'large':
            return 54;
        default:
            return 44;
    }
};

const AnimatedBox = Animated.createAnimatedComponent(Box);

// ============================================================================
// Component
// ============================================================================

/**
 * Button component
 * 
 * Theme-aware button with press animations and haptics.
 * 
 * @example
 * <Button
 *   label="Start Session"
 *   variant="primary"
 *   onPress={() => {}}
 * />
 */
export function Button({
    label,
    variant = 'primary',
    size = 'medium',
    disabled = false,
    loading = false,
    leftIcon,
    rightIcon,
    onPress,
    ...pressableProps
}: ButtonProps) {
    const theme = useTheme<Theme>();
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        if (disabled || loading) return;
        scale.value = withSpring(patterns.buttonPress.pressedScale, springs.snappy);
        triggerHaptic(patterns.buttonPress.haptic);
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, springs.snappy);
    };

    const handlePress = () => {
        if (disabled || loading) return;
        onPress?.();
    };

    const isDisabled = disabled || loading;
    const padding = getPadding(size);
    const minHeight = getMinHeight(size);
    const bgColor = getBackgroundColor(variant, isDisabled);
    const textColor = getTextColor(variant, isDisabled);
    const showShadow = variant === 'primary' || variant === 'destructive';
    const borderColor =
        variant === 'secondary'
            ? 'borderStrong'
            : variant === 'ghost'
                ? 'borderMuted'
                : 'accentBrandPressed';

    return (
        <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled }}
            {...pressableProps}
        >
            <AnimatedBox
                style={[animatedStyle, { minHeight }]}
                backgroundColor={bgColor}
                paddingVertical={padding.paddingVertical}
                paddingHorizontal={padding.paddingHorizontal}
                borderRadius="full"
                flexDirection="row"
                alignItems="center"
                justifyContent="center"
                gap="xs"
                borderWidth={variant === 'ghost' || variant === 'secondary' ? 1 : 0}
                borderColor={variant === 'ghost' || variant === 'secondary' ? borderColor : undefined}
                opacity={isDisabled ? 0.6 : 1}
                shadowColor={showShadow ? theme.colors.black : undefined}
                shadowOffset={showShadow ? { width: 0, height: 8 } : undefined}
                shadowOpacity={showShadow ? 0.18 : 0}
                shadowRadius={showShadow ? 12 : 0}
                elevation={showShadow ? 4 : 0}
            >
                {loading ? (
                    <ActivityIndicator
                        size="small"
                        color={theme.colors[textColor]}
                    />
                ) : (
                    <>
                        {leftIcon}
                        <Text variant="labelLarge" color={textColor}>
                            {label}
                        </Text>
                        {rightIcon}
                    </>
                )}
            </AnimatedBox>
        </Pressable>
    );
}
