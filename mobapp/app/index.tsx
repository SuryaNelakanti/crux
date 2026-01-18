import { formatDuration, formatRelativeTime } from '@crux/shared';
import type { Theme } from '@crux/theme';
import { Badge, Box, Button, Card, StatChip, Text } from '@crux/ui';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@shopify/restyle';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { ScreenReveal } from '@/components/ScreenReveal';
import { createSession, getSessionSummaries, type SessionSummary } from '@/features/session';

/**
 * Home Screen
 *
 * Entry point for the app.
 * Shows recent sessions and quick actions.
 */
export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme<Theme>();
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
    <Box flex={1} backgroundColor="bgCanvas">
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.m,
          paddingBottom: theme.spacing['3xl'],
        }}
      >
        <Box gap="xl">
          <ScreenReveal>
            <Box gap="l">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                <Box gap="xs">
                  <Text variant="displaySmall" color="textPrimary">
                    Crux
                  </Text>
                  <Text variant="bodyMedium" color="textSecondary">
                    Photo-first bouldering journal
                  </Text>
                </Box>
                <Box alignItems="flex-end" gap="xs">
                  <Sparkle size={20} color="accentBrand" />
                  <DoodleWave width={90} height={24} color="accentBrand" />
                </Box>
              </Box>

              <Card variant="elevated">
                <Box gap="m">
                  <Text variant="headingSmall" color="textPrimary">
                    Start a session
                  </Text>
                  <Text variant="bodyMedium" color="textSecondary">
                    Capture problems in under 15 seconds. Offline ready.
                  </Text>
                  <Button
                    label="Start Session"
                    variant="primary"
                    size="large"
                    onPress={handleStartSession}
                  />
                  <Box flexDirection="row" gap="s" flexWrap="wrap">
                    <Badge label="Offline" variant="brand" size="small" />
                    <Badge label="Auto mask" variant="info" size="small" />
                    <Badge label="Shareable" variant="default" size="small" />
                  </Box>
                </Box>
              </Card>
            </Box>
          </ScreenReveal>

          <ScreenReveal delay={120}>
            <Box gap="m">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                <Text variant="headingSmall" color="textPrimary">
                  Recent sessions
                </Text>
                <Button
                  label="Design System"
                  variant="ghost"
                  size="small"
                  onPress={() => router.push('/design-system')}
                />
              </Box>

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
                  <Box alignItems="center" paddingVertical="l" gap="xs">
                    <Text variant="bodyMedium" color="textMuted">
                      No sessions yet
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      Start your first climbing session
                    </Text>
                  </Box>
                </Card>
              ) : (
                <Box gap="m">
                  {sessions.map((session) => {
                    const duration = session.endTs
                      ? formatDuration(session.startTs.getTime(), session.endTs.getTime())
                      : 'Live';
                    return (
                      <Card
                        key={session.id}
                        variant="outlined"
                        pressable
                        padding="none"
                        onPress={() => router.push(`/session/${session.id}`)}
                      >
                        <Box padding="m" gap="s">
                          <Box flexDirection="row" justifyContent="space-between">
                            <Box gap="2xs">
                              <Text variant="labelLarge" color="textPrimary">
                                {session.startTs.toLocaleDateString()}
                              </Text>
                              <Text variant="bodySmall" color="textMuted">
                                {formatRelativeTime(session.startTs)} - {duration}
                              </Text>
                            </Box>
                            {session.endTs ? (
                              <Badge label="Ended" variant="default" size="small" />
                            ) : (
                              <Badge label="Live" variant="brand" size="small" />
                            )}
                          </Box>
                          <Box flexDirection="row" gap="s">
                            <StatChip
                              label="Problems"
                              value={session.problemCount}
                              accent="textPrimary"
                            />
                            <StatChip
                              label="Sends"
                              value={session.sendCount}
                              accent="statusSuccess"
                            />
                            <StatChip
                              label="Flashes"
                              value={session.flashCount}
                              accent="accentBrand"
                            />
                          </Box>
                        </Box>
                      </Card>
                    );
                  })}
                </Box>
              )}
            </Box>
          </ScreenReveal>
        </Box>
      </ScrollView>
    </Box>
  );
}
