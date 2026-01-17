import React from 'react';
import { Pressable } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { springs, triggerHaptic } from '@crux/theme';

// ============================================================================
// Types
// ============================================================================

export interface SegmentedControlOption<T extends string> {
    value: T;
    label: string;
}

export interface SegmentedControlProps<T extends string> {
    /** Options to display */
    options: SegmentedControlOption<T>[];
    /** Currently selected value */
    value: T;
    /** Change handler */
    onChange: (value: T) => void;
    /** Disabled state */
    disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

const AnimatedBox = Animated.createAnimatedComponent(Box);

/**
 * SegmentedControl component
 * 
 * Horizontal tab-like control for selecting between options.
 * Features sliding indicator animation.
 * 
 * @example
 * <SegmentedControl
 *   options={[
 *     { value: 'flash', label: 'Flash' },
 *     { value: 'send', label: 'Send' },
 *     { value: 'tried', label: 'Tried' },
 *   ]}
 *   value={outcome}
 *   onChange={setOutcome}
 * />
 */
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    disabled = false,
}: SegmentedControlProps<T>) {
    const selectedIndex = options.findIndex((opt) => opt.value === value);

    const handlePress = (optionValue: T) => {
        if (disabled) return;
        triggerHaptic('selection');
        onChange(optionValue);
    };

    return (
        <Box
            flexDirection="row"
            backgroundColor="bgMuted"
            borderRadius="m"
            padding="2xs"
            opacity={disabled ? 0.5 : 1}
        >
            {options.map((option, index) => {
                const isSelected = option.value === value;

                return (
                    <Pressable
                        key={option.value}
                        onPress={() => handlePress(option.value)}
                        disabled={disabled}
                        style={{ flex: 1 }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isSelected }}
                    >
                        <Box
                            paddingVertical="s"
                            paddingHorizontal="m"
                            borderRadius="s"
                            backgroundColor={isSelected ? 'bgSurfaceRaised' : 'transparent'}
                            alignItems="center"
                            justifyContent="center"
                            shadowColor={isSelected ? 'black' : undefined}
                            shadowOffset={isSelected ? { width: 0, height: 1 } : undefined}
                            shadowOpacity={isSelected ? 0.05 : 0}
                            shadowRadius={isSelected ? 2 : 0}
                            elevation={isSelected ? 1 : 0}
                        >
                            <Text
                                variant="labelMedium"
                                color={isSelected ? 'textPrimary' : 'textSecondary'}
                            >
                                {option.label}
                            </Text>
                        </Box>
                    </Pressable>
                );
            })}
        </Box>
    );
}
