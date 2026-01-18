import { durations, easing, type Theme, triggerHaptic } from '@crux/theme';
import { useTheme } from '@shopify/restyle';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';

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
  const theme = useTheme<Theme>();
  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const [containerWidth, setContainerWidth] = useState(0);
  const indicatorX = useSharedValue(0);

  const inset = theme.spacing['2xs'];
  const segmentWidth = containerWidth > 0 ? (containerWidth - inset * 2) / options.length : 0;

  useEffect(() => {
    if (!segmentWidth) return;
    indicatorX.value = withTiming(inset + selectedIndex * segmentWidth, {
      duration: durations.fast,
      easing: easing.standardDecelerate,
    });
  }, [indicatorX, inset, segmentWidth, selectedIndex]);

  const handlePress = (optionValue: T) => {
    if (disabled) return;
    triggerHaptic('selection');
    onChange(optionValue);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <Box
      flexDirection="row"
      backgroundColor="bgSurface"
      borderRadius="full"
      padding="2xs"
      borderWidth={1}
      borderColor="borderMuted"
      opacity={disabled ? 0.5 : 1}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      position="relative"
    >
      {segmentWidth > 0 && (
        <AnimatedBox
          style={indicatorStyle}
          position="absolute"
          top={inset}
          bottom={inset}
          width={segmentWidth}
          borderRadius="full"
          backgroundColor="bgSurfaceRaised"
          shadowColor="black"
          shadowOffset={{ width: 0, height: 4 }}
          shadowOpacity={0.12}
          shadowRadius={8}
          elevation={3}
        />
      )}
      {options.map((option) => {
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
              borderRadius="full"
              backgroundColor="transparent"
              alignItems="center"
              justifyContent="center"
            >
              <Text variant="labelMedium" color={isSelected ? 'textPrimary' : 'textSecondary'}>
                {option.label}
              </Text>
            </Box>
          </Pressable>
        );
      })}
    </Box>
  );
}
