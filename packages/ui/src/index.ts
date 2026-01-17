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

// Primitives (Layout building blocks)
export { Box, type BoxProps } from './primitives/Box';
export { Text, type TextProps } from './primitives/Text';

// Components
export {
    Button,
    type ButtonProps,
    type ButtonVariant,
    type ButtonSize,
} from './components/Button';

export {
    Card,
    type CardProps,
    type CardVariant,
} from './components/Card';

export {
    TextField,
    type TextFieldProps,
} from './components/TextField';

export {
    SegmentedControl,
    type SegmentedControlProps,
    type SegmentedControlOption,
} from './components/SegmentedControl';

export {
    Badge,
    type BadgeProps,
    type BadgeVariant,
    type BadgeSize,
} from './components/Badge';

export {
    StatChip,
    type StatChipProps,
} from './components/StatChip';

export {
    Progress,
    type ProgressProps,
} from './components/Progress';

export {
    Skeleton,
    SkeletonText,
    SkeletonAvatar,
    SkeletonCard,
    type SkeletonProps,
} from './components/Skeleton';

// Product primitives
export {
    ProblemCard,
    type ProblemCardProps,
    type ProblemOutcome,
} from './components/ProblemCard';
