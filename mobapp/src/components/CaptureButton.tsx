import { patterns, springs, triggerHaptic } from '@crux/theme';
import { Box } from '@crux/ui';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedBox = Animated.createAnimatedComponent(Box);

export function CaptureButton({
  onPress,
  disabled = false,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(patterns.buttonPress.pressedScale, springs.snappy);
    triggerHaptic('light');
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.snappy);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <AnimatedBox
        style={animatedStyle}
        width={76}
        height={76}
        borderRadius="full"
        alignItems="center"
        justifyContent="center"
        borderWidth={2}
        borderColor="accentBrand"
        backgroundColor="bgSurface"
        shadowColor="black"
        shadowOffset={{ width: 0, height: 8 }}
        shadowOpacity={0.18}
        shadowRadius={14}
        elevation={6}
      >
        <Box
          width={56}
          height={56}
          borderRadius="full"
          backgroundColor="accentBrand"
          style={{ opacity: disabled ? 0.5 : 1 }}
        />
      </AnimatedBox>
    </Pressable>
  );
}
