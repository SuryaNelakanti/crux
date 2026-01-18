import { durations, type Theme } from '@crux/theme';
import { useTheme } from '@shopify/restyle';
import { TextInput, type TextInputProps } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';

// ============================================================================
// Types
// ============================================================================

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  /** Field label */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Disabled state */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

const AnimatedBox = Animated.createAnimatedComponent(Box);

/**
 * TextField component
 *
 * Text input with label, focus animation, and error state.
 *
 * @example
 * <TextField
 *   label="Session Name"
 *   placeholder="Enter name..."
 *   value={value}
 *   onChangeText={setValue}
 * />
 */
export function TextField({
  label,
  placeholder,
  error,
  helperText,
  disabled = false,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const theme = useTheme<Theme>();
  const focused = useSharedValue(0);

  const handleFocus: TextInputProps['onFocus'] = (e) => {
    focused.value = withTiming(1, { duration: durations.fast });
    onFocus?.(e);
  };

  const handleBlur: TextInputProps['onBlur'] = (e) => {
    focused.value = withTiming(0, { duration: durations.fast });
    onBlur?.(e);
  };

  const borderAnimatedStyle = useAnimatedStyle(() => {
    const borderColor = error
      ? theme.colors.borderError
      : interpolateColor(
          focused.value,
          [0, 1],
          [theme.colors.borderDefault, theme.colors.borderFocus]
        );
    const backgroundColor = interpolateColor(
      focused.value,
      [0, 1],
      [theme.colors.bgSurface, theme.colors.bgSurfaceRaised]
    );

    return {
      borderColor,
      borderWidth: focused.value > 0.5 || error ? 2 : 1,
      backgroundColor,
    };
  });

  return (
    <Box opacity={disabled ? 0.5 : 1}>
      {label && (
        <Text
          variant="labelMedium"
          color={error ? 'statusError' : 'textSecondary'}
          marginBottom="xs"
        >
          {label}
        </Text>
      )}

      <AnimatedBox
        style={borderAnimatedStyle}
        borderRadius="l"
        paddingHorizontal="m"
        paddingVertical="m"
      >
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          editable={!disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            color: theme.colors.textPrimary,
            fontFamily: theme.textVariants.bodyMedium.fontFamily,
            fontSize: theme.textVariants.bodyMedium.fontSize,
            lineHeight: theme.textVariants.bodyMedium.lineHeight,
            padding: 0,
            margin: 0,
          }}
          {...inputProps}
        />
      </AnimatedBox>

      {(error || helperText) && (
        <Text variant="bodySmall" color={error ? 'statusError' : 'textMuted'} marginTop="xs">
          {error || helperText}
        </Text>
      )}
    </Box>
  );
}
