import { createBox } from '@shopify/restyle';
import type { Theme } from '@crux/theme';

/**
 * Box primitive
 * 
 * Theme-aware View replacement.
 * Use for all layout and container needs.
 * 
 * @example
 * <Box padding="m" backgroundColor="bgSurface" borderRadius="m">
 *   <Text>Content</Text>
 * </Box>
 */
export const Box = createBox<Theme>();

export type BoxProps = React.ComponentProps<typeof Box>;
