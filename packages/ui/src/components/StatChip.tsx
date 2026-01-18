import type { Theme } from '@crux/theme';
import type React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';

// ============================================================================
// Types
// ============================================================================

export interface StatChipProps {
  /** Stat label */
  label: string;
  /** Stat value (will use tabular numbers) */
  value: string | number;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Optional subtext */
  subtext?: string;
  /** Color accent */
  accent?: keyof Theme['colors'];
}

// ============================================================================
// Component
// ============================================================================

/**
 * StatChip component
 *
 * Displays a statistic with label. Uses tabular numbers for alignment.
 *
 * @example
 * <StatChip label="Problems" value={42} />
 */
export function StatChip({ label, value, icon, subtext, accent = 'textPrimary' }: StatChipProps) {
  return (
    <Box
      alignItems="center"
      gap="2xs"
      padding="s"
      borderRadius="l"
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderMuted"
      minWidth={86}
    >
      {icon && <Box marginBottom="2xs">{icon}</Box>}
      <Text variant="statSmall" color={accent}>
        {value}
      </Text>
      <Text variant="labelSmall" color="textSecondary">
        {label}
      </Text>
      {subtext && (
        <Text variant="bodySmall" color="textMuted">
          {subtext}
        </Text>
      )}
    </Box>
  );
}
