import { patterns, springs, triggerHaptic } from '@crux/theme';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Box, type BoxProps } from '../primitives/Box';

// ============================================================================
// Types
// ============================================================================

export type CardVariant = 'default' | 'elevated' | 'outlined';

export interface CardProps extends Omit<BoxProps, 'style'> {
  /** Visual variant */
  variant?: CardVariant;
  /** If true, card is pressable with animation */
  pressable?: boolean;
  /** Press handler (only used if pressable) */
  onPress?: () => void;
  /** Content */
  children: ReactNode;
}

// ============================================================================
// Helpers
// ============================================================================

const getVariantStyles = (variant: CardVariant): Partial<BoxProps> => {
  switch (variant) {
    case 'elevated':
      return {
        backgroundColor: 'bgSurfaceRaised',
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
        borderWidth: 1,
        borderColor: 'borderMuted',
      } as Partial<BoxProps>;
    case 'outlined':
      return {
        backgroundColor: 'bgSurfaceRaised',
        borderWidth: 1,
        borderColor: 'borderStrong',
      };
    default:
      return {
        backgroundColor: 'bgSurface',
        borderWidth: 1,
        borderColor: 'borderMuted',
      };
  }
};

const AnimatedBox = Animated.createAnimatedComponent(Box);

// ============================================================================
// Component
// ============================================================================

/**
 * Card component
 *
 * Container with elevation variants and optional press behavior.
 *
 * @example
 * <Card variant="elevated" pressable onPress={() => {}}>
 *   <Text>Card content</Text>
 * </Card>
 */
export function Card({
  variant = 'default',
  pressable = false,
  onPress,
  children,
  ...boxProps
}: CardProps) {
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

  const variantStyles = getVariantStyles(variant);

  const cardContent = (
    <AnimatedBox
      style={pressable ? animatedStyle : undefined}
      padding="m"
      borderRadius="l"
      overflow="hidden"
      {...variantStyles}
      {...boxProps}
    >
      {children}
    </AnimatedBox>
  );

  if (pressable) {
    return (
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        accessibilityRole="button"
      >
        {cardContent}
      </Pressable>
    );
  }

  return cardContent;
}
