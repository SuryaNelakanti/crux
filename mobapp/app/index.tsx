import { formatDuration, formatRelativeTime } from '@crux/shared';
import type { Theme } from '@crux/theme';
import { Badge, Box, Button, Card, StatChip, Text } from '@crux/ui';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@shopify/restyle';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
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

  const activeSession = sessions.find((session) => !session.endTs) ?? null;

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
            <Box gap="m">
              <Text variant="displaySmall" color="textPrimary">
                Crux
              </Text>
              <Text variant="bodyMedium" color="textSecondary">
                Camera-first bouldering log
              </Text>
              {activeSession ? (
                <Card
                  variant="elevated"
                  pressable
                  padding="none"
                  onPress={() => router.push(`/session/${activeSession.id}`)}
                >
                  <Box padding="m" gap="m">
                    <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                      <Box gap="2xs">
                        <Text variant="headingSmall" color="textPrimary">
                          Active session
                        </Text>
                        <Text variant="bodySmall" color="textMuted">
                          {formatRelativeTime(activeSession.startTs)}
                        </Text>
                      </Box>
                      <Badge label="Live" variant="brand" size="small" />
                    </Box>
                    <Box flexDirection="row" gap="s">
                      <StatChip
                        label="Problems"
                        value={activeSession.problemCount}
                        accent="textPrimary"
                      />
                      <StatChip
                        label="Sends"
                        value={activeSession.sendCount}
                        accent="statusSuccess"
                      />
                      <StatChip
                        label="Flashes"
                        value={activeSession.flashCount}
                        accent="accentBrand"
                      />
                    </Box>
                    <Button
                      label="Resume Session"
                      variant="primary"
                      size="large"
                      onPress={() => router.push(`/session/${activeSession.id}`)}
                    />
                  </Box>
                </Card>
              ) : (
                <Button
                  label="Start Session"
                  variant="primary"
                  size="large"
                  onPress={handleStartSession}
                />
              )}
            </Box>
          </ScreenReveal>

          <ScreenReveal delay={120}>
            <Box gap="m">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                <Text variant="headingSmall" color="textPrimary">
                  Previous sessions
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
              ) : sessions.filter((session) => session.id !== activeSession?.id).length === 0 ? (
                <Card variant="outlined">
                  <Box alignItems="center" paddingVertical="l" gap="xs">
                    <Text variant="bodyMedium" color="textMuted">
                      No previous sessions
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      Finished sessions will appear here.
                    </Text>
                  </Box>
                </Card>
              ) : (
                <Box gap="m">
                  {sessions
                    .filter((session) => session.id !== activeSession?.id)
                    .map((session) => {
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
