import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Box, Text, Button, Card, StatChip } from '@crux/ui';
import { createSession, getSessionSummaries, type SessionSummary } from '@/features/session';

/**
 * Home Screen
 * 
 * Entry point for the app.
 * Shows recent sessions and quick actions.
 */
export default function HomeScreen() {
    const router = useRouter();
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const loadSessions = useCallback(async () => {
        setLoading(true);
        const data = await getSessionSummaries();
        setSessions(data);
        setLoading(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadSessions();
        }, [loadSessions])
    );

    const handleStartSession = async () => {
        const session = await createSession();
        router.push(`/session/${session.id}`);
    };

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
                    onPress={handleStartSession}
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

                {loading ? (
                    <Card variant="outlined">
                        <Box alignItems="center" paddingVertical="l">
                            <Text variant="bodyMedium" color="textMuted">
                                Loading sessions...
                            </Text>
                        </Box>
                    </Card>
                ) : sessions.length === 0 ? (
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
                ) : (
                    <Box gap="m">
                        {sessions.map((session) => (
                            <Card
                                key={session.id}
                                variant="outlined"
                                pressable
                                padding="none"
                                onPress={() => router.push(`/session/${session.id}`)}
                            >
                                <Box padding="m" gap="s">
                                    <Text variant="labelLarge" color="textPrimary">
                                        {session.startTs.toLocaleDateString()}
                                    </Text>
                                    <Box flexDirection="row" justifyContent="space-between">
                                        <StatChip label="Problems" value={session.problemCount} />
                                        <StatChip label="Sends" value={session.sendCount} />
                                        <StatChip label="Flashes" value={session.flashCount} />
                                    </Box>
                                </Box>
                            </Card>
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
}
