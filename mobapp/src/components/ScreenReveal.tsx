import { easing, patterns } from '@crux/theme';
import { Box, type BoxProps } from '@crux/ui';
import { useEffect } from 'react';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const AnimatedBox = Animated.createAnimatedComponent(Box);

export function ScreenReveal({
  delay = 0,
  children,
  ...boxProps
}: {
  delay?: number;
  children: React.ReactNode;
} & Omit<BoxProps, 'style'>) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: patterns.screenEnter.duration,
        easing: easing.emphasizedDecelerate,
      })
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [patterns.screenEnter.initialOpacity, patterns.screenEnter.finalOpacity]
    ),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [patterns.screenEnter.initialOffset, patterns.screenEnter.finalOffset]
        ),
      },
    ],
  }));

  return (
    <AnimatedBox style={animatedStyle} {...boxProps}>
      {children}
    </AnimatedBox>
  );
}
