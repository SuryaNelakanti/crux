import { createText } from '@shopify/restyle';
import type { Theme } from '@crux/theme';

/**
 * Text primitive
 * 
 * Theme-aware Text replacement.
 * Always use variant prop, never raw fontSize.
 * 
 * @example
 * <Text variant="headingLarge" color="textPrimary">
 *   Hello World
 * </Text>
 */
export const Text = createText<Theme>();

export type TextProps = React.ComponentProps<typeof Text>;
