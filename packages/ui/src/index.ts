/**
 * @crux/ui
 *
 * Component library for Crux app.
 * Built on @crux/theme with Restyle + Reanimated.
 *
 * Usage:
 * - Import primitives (Box, Text) for layout
 * - Import components for UI elements
 * - Never use StyleSheet.create in screens
 *
 * Rules:
 * - Screens should assemble components from this package
 * - Styling/motion is encapsulated in components
 * - Use variant props, not custom styles
 */

export {
  Badge,
  type BadgeProps,
  type BadgeSize,
  type BadgeVariant,
} from './components/Badge';
// Components
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './components/Button';
export {
  Card,
  type CardProps,
  type CardVariant,
} from './components/Card';
// Product primitives
export {
  ProblemCard,
  type ProblemCardProps,
  type ProblemOutcome,
} from './components/ProblemCard';
export {
  Progress,
  type ProgressProps,
} from './components/Progress';

export {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
} from './components/SegmentedControl';
export {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  type SkeletonProps,
  SkeletonText,
} from './components/Skeleton';

export {
  StatChip,
  type StatChipProps,
} from './components/StatChip';
export {
  TextField,
  type TextFieldProps,
} from './components/TextField';
// Primitives (Layout building blocks)
export { Box, type BoxProps } from './primitives/Box';
export { Text, type TextProps } from './primitives/Text';
