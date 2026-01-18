import { type Theme, triggerHaptic } from '@crux/theme';
import {
  Badge,
  Box,
  Button,
  Card,
  Progress,
  SegmentedControl,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  StatChip,
  Text,
  TextField,
} from '@crux/ui';
import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useThemeControl } from './_layout';

/**
 * Design System Playground
 *
 * Systematic review surface for designers.
 * Displays all typography, components, and motion demos.
 */
export default function DesignSystemScreen() {
  const theme = useTheme<Theme>();
  const { themeName, toggleTheme } = useThemeControl();
  const [textValue, setTextValue] = useState('');
  const [outcome, setOutcome] = useState<'flash' | 'send' | 'tried'>('send');
  const [showLoading, setShowLoading] = useState(false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bgCanvas }}
      contentContainerStyle={{ padding: theme.spacing.m, paddingBottom: 100 }}
    >
      {/* Header */}
      <Box
        paddingTop="xl"
        paddingBottom="l"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Box>
          <Text variant="headingLarge" color="textPrimary">
            Design System
          </Text>
          <Text variant="bodySmall" color="textMuted">
            CRED-level component review
          </Text>
        </Box>
        <Button
          label={themeName === 'dark' ? '☀️' : '🌙'}
          variant="ghost"
          size="small"
          onPress={toggleTheme}
        />
      </Box>

      {/* Back button */}
      <Button label="← Back to Home" variant="ghost" size="small" onPress={() => router.back()} />

      <Box height={24} />

      {/* Typography Section */}
      <SectionHeader title="Typography" />
      <Card variant="outlined">
        <Box gap="m">
          <Text variant="displayLarge" color="textPrimary">
            Display Large
          </Text>
          <Text variant="displayMedium" color="textPrimary">
            Display Medium
          </Text>
          <Text variant="displaySmall" color="textPrimary">
            Display Small
          </Text>
          <Box height={8} />
          <Text variant="headingLarge" color="textPrimary">
            Heading Large
          </Text>
          <Text variant="headingMedium" color="textPrimary">
            Heading Medium
          </Text>
          <Text variant="headingSmall" color="textPrimary">
            Heading Small
          </Text>
          <Box height={8} />
          <Text variant="bodyLarge" color="textPrimary">
            Body Large - The quick brown fox
          </Text>
          <Text variant="bodyMedium" color="textPrimary">
            Body Medium - The quick brown fox
          </Text>
          <Text variant="bodySmall" color="textPrimary">
            Body Small - The quick brown fox
          </Text>
          <Box height={8} />
          <Text variant="labelLarge" color="textSecondary">
            Label Large
          </Text>
          <Text variant="labelMedium" color="textSecondary">
            Label Medium
          </Text>
          <Text variant="labelSmall" color="textSecondary">
            Label Small
          </Text>
          <Box height={8} />
          <Text variant="statLarge" color="accentBrand">
            42
          </Text>
          <Text variant="statMedium" color="textPrimary">
            1,234
          </Text>
          <Text variant="statSmall" color="textSecondary">
            99.9%
          </Text>
          <Box height={8} />
          <Text variant="code" color="textSecondary">
            const x = 42;
          </Text>
        </Box>
      </Card>

      <Box height={24} />

      {/* Colors Section */}
      <SectionHeader title="Semantic Colors" />
      <Card variant="outlined">
        <Box gap="s">
          <ColorSwatch label="bgCanvas" color={theme.colors.bgCanvas} />
          <ColorSwatch label="bgSurface" color={theme.colors.bgSurface} />
          <ColorSwatch label="bgMuted" color={theme.colors.bgMuted} />
          <ColorSwatch label="textPrimary" color={theme.colors.textPrimary} />
          <ColorSwatch label="textSecondary" color={theme.colors.textSecondary} />
          <ColorSwatch label="accentBrand" color={theme.colors.accentBrand} />
          <ColorSwatch label="statusSuccess" color={theme.colors.statusSuccess} />
          <ColorSwatch label="statusWarning" color={theme.colors.statusWarning} />
          <ColorSwatch label="statusError" color={theme.colors.statusError} />
        </Box>
      </Card>

      <Box height={24} />

      {/* Buttons Section */}
      <SectionHeader title="Buttons" />
      <Card variant="outlined">
        <Box gap="m">
          <Text variant="labelMedium" color="textSecondary">
            Variants
          </Text>
          <Button label="Primary" variant="primary" onPress={() => triggerHaptic('success')} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Ghost" variant="ghost" onPress={() => {}} />
          <Button label="Destructive" variant="destructive" onPress={() => {}} />

          <Box height={8} />
          <Text variant="labelMedium" color="textSecondary">
            Sizes
          </Text>
          <Button label="Large" variant="primary" size="large" onPress={() => {}} />
          <Button label="Medium" variant="primary" size="medium" onPress={() => {}} />
          <Button label="Small" variant="primary" size="small" onPress={() => {}} />

          <Box height={8} />
          <Text variant="labelMedium" color="textSecondary">
            States
          </Text>
          <Button label="Disabled" variant="primary" disabled onPress={() => {}} />
          <Button
            label="Loading"
            variant="primary"
            loading={showLoading}
            onPress={() => {
              setShowLoading(true);
              setTimeout(() => setShowLoading(false), 2000);
            }}
          />
        </Box>
      </Card>

      <Box height={24} />

      {/* Cards Section */}
      <SectionHeader title="Cards" />
      <Box gap="m">
        <Card variant="default">
          <Text variant="labelMedium" color="textSecondary">
            Default Card
          </Text>
          <Text variant="bodyMedium" color="textPrimary">
            Basic surface container
          </Text>
        </Card>
        <Card variant="elevated">
          <Text variant="labelMedium" color="textSecondary">
            Elevated Card
          </Text>
          <Text variant="bodyMedium" color="textPrimary">
            With shadow elevation
          </Text>
        </Card>
        <Card variant="outlined">
          <Text variant="labelMedium" color="textSecondary">
            Outlined Card
          </Text>
          <Text variant="bodyMedium" color="textPrimary">
            With border
          </Text>
        </Card>
        <Card variant="elevated" pressable onPress={() => triggerHaptic('light')}>
          <Text variant="labelMedium" color="textSecondary">
            Pressable Card
          </Text>
          <Text variant="bodyMedium" color="textPrimary">
            Tap for animation + haptic
          </Text>
        </Card>
      </Box>

      <Box height={24} />

      {/* Form Elements */}
      <SectionHeader title="Form Elements" />
      <Card variant="outlined">
        <Box gap="m">
          <TextField
            label="Session Name"
            placeholder="Enter name..."
            value={textValue}
            onChangeText={setTextValue}
          />
          <TextField
            label="With Error"
            placeholder="Invalid input"
            error="This field is required"
          />
          <TextField label="Disabled" placeholder="Cannot edit" disabled />

          <Box height={8} />
          <Text variant="labelMedium" color="textSecondary">
            Segmented Control
          </Text>
          <SegmentedControl
            options={[
              { value: 'flash', label: 'Flash' },
              { value: 'send', label: 'Send' },
              { value: 'tried', label: 'Tried' },
            ]}
            value={outcome}
            onChange={setOutcome}
          />
        </Box>
      </Card>

      <Box height={24} />

      {/* Badges */}
      <SectionHeader title="Badges" />
      <Card variant="outlined">
        <Box flexDirection="row" flexWrap="wrap" gap="s">
          <Badge label="Default" variant="default" />
          <Badge label="Success" variant="success" />
          <Badge label="Warning" variant="warning" />
          <Badge label="Error" variant="error" />
          <Badge label="Info" variant="info" />
          <Badge label="Brand" variant="brand" />
        </Box>
        <Box height={8} />
        <Box flexDirection="row" gap="s">
          <Badge label="Small" variant="brand" size="small" />
          <Badge label="Medium" variant="brand" size="medium" />
        </Box>
      </Card>

      <Box height={24} />

      {/* Stats */}
      <SectionHeader title="Statistics" />
      <Card variant="outlined">
        <Box flexDirection="row" justifyContent="space-around">
          <StatChip label="Problems" value={42} />
          <StatChip label="Sends" value={28} accent="statusSuccess" />
          <StatChip label="Flashes" value={8} accent="accentBrand" />
        </Box>
      </Card>

      <Box height={24} />

      {/* Progress */}
      <SectionHeader title="Progress" />
      <Card variant="outlined">
        <Box gap="m">
          <Progress value={75} label="Session Progress" showPercentage />
          <Progress value={33} />
          <Progress value={100} label="Complete" />
        </Box>
      </Card>

      <Box height={24} />

      {/* Skeletons */}
      <SectionHeader title="Skeleton Loaders" />
      <Box gap="m">
        <Card variant="outlined">
          <Text variant="labelMedium" color="textSecondary" marginBottom="s">
            Basic Skeletons
          </Text>
          <Box gap="s">
            <Skeleton width="100%" height={24} />
            <Skeleton width="80%" height={16} />
            <Skeleton width="60%" height={16} />
          </Box>
        </Card>
        <Card variant="outlined">
          <Text variant="labelMedium" color="textSecondary" marginBottom="s">
            Text Skeleton
          </Text>
          <SkeletonText lines={3} />
        </Card>
        <Text variant="labelMedium" color="textSecondary">
          Card Skeleton
        </Text>
        <SkeletonCard />
      </Box>

      <Box height={48} />
    </ScrollView>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  return (
    <Text variant="headingSmall" color="textPrimary" marginBottom="m">
      {title}
    </Text>
  );
}

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <Box flexDirection="row" alignItems="center" gap="s">
      <Box
        width={32}
        height={32}
        borderRadius="s"
        style={{ backgroundColor: color }}
        borderWidth={1}
        borderColor="borderDefault"
      />
      <Text variant="labelMedium" color="textSecondary">
        {label}
      </Text>
      <Text variant="code" color="textMuted">
        {color}
      </Text>
    </Box>
  );
}
