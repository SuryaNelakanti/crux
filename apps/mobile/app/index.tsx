import { Link } from 'expo-router';
import { Box, Text, Button, Card } from '@crux/ui';

/**
 * Home Screen
 * 
 * Entry point for the app.
 * Shows recent sessions and quick actions.
 */
export default function HomeScreen() {
    return (
        <Box flex={1} backgroundColor="bgCanvas" padding="m">
            {/* Header */}
            <Box paddingTop="3xl" paddingBottom="l">
                <Text variant="displaySmall" color="textPrimary">
                    Crux
                </Text>
                <Text variant="bodyMedium" color="textSecondary" marginTop="xs">
                    Your bouldering journal
                </Text>
            </Box>

            {/* Quick Actions */}
            <Box gap="m">
                <Button
                    label="Start Session"
                    variant="primary"
                    size="large"
                    onPress={() => {
                        // TODO: Navigate to session start
                    }}
                />

                <Link href="/design-system" asChild>
                    <Button
                        label="Design System"
                        variant="secondary"
                        size="medium"
                    />
                </Link>
            </Box>

            {/* Recent Sessions */}
            <Box marginTop="xl">
                <Text variant="headingSmall" color="textPrimary" marginBottom="m">
                    Recent Sessions
                </Text>

                <Card variant="outlined">
                    <Box alignItems="center" paddingVertical="l">
                        <Text variant="bodyMedium" color="textMuted">
                            No sessions yet
                        </Text>
                        <Text variant="bodySmall" color="textMuted" marginTop="xs">
                            Start your first climbing session
                        </Text>
                    </Box>
                </Card>
            </Box>
        </Box>
    );
}
