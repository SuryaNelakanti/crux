import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@shopify/restyle';
import { Badge, Box, Button, Card, ProblemCard, StatChip, Text } from '@crux/ui';
import type { Theme } from '@crux/theme';
import { formatRelativeTime } from '@crux/shared';
import { endSession, getSessionById, type SessionSummary } from '@/features/session';
import {
    getProblemCardsForSession,
    type ProblemCardItem,
} from '@/features/problem';
import { runSync } from '@/lib/sync';
import { DoodleWave } from '@/components/Doodle';
import { ScreenReveal } from '@/components/ScreenReveal';

export default function SessionScreen() {
    const router = useRouter();
    const theme = useTheme<Theme>();
    const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
    const [problems, setProblems] = useState<ProblemCardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<SessionSummary | null>(null);

    const load = useCallback(async () => {
        if (!sessionId) return;
        setLoading(true);
        const sessionData = await getSessionById(sessionId);
        if (!sessionData) {
            setLoading(false);
            return;
        }
        setSession({
            id: sessionData.id,
            startTs: sessionData.startTs,
            endTs: sessionData.endTs,
            problemCount: 0,
            sendCount: 0,
            flashCount: 0,
        });
        const cards = await getProblemCardsForSession(sessionId);
        setProblems(cards);
        setLoading(false);
    }, [sessionId]);

    useEffect(() => {
        if (Platform.OS === 'web') return;
        void runSync();
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load])
    );

    const handleEndSession = async () => {
        if (!sessionId) return;
        await endSession(sessionId);
        router.replace('/');
    };

    const handleAddProblem = () => {
        if (!sessionId) return;
        router.push(`/session/${sessionId}/camera`);
    };

    if (!sessionId) {
        return (
            <Box flex={1} backgroundColor="bgCanvas" padding="m">
                <Card variant="outlined">
                    <Text variant="bodyMedium" color="textMuted">
                        Session not found.
                    </Text>
                </Card>
            </Box>
        );
    }

    const sendCount = problems.filter((problem) => problem.outcome === 'send').length;
    const flashCount = problems.filter((problem) => problem.outcome === 'flash').length;

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
                            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                                <Box gap="xs">
                                    <Text variant="headingLarge" color="textPrimary">
                                        Session
                                    </Text>
                                    <Text variant="bodySmall" color="textSecondary">
                                        {session?.startTs
                                            ? formatRelativeTime(session.startTs)
                                            : sessionId}
                                    </Text>
                                </Box>
                                <Box alignItems="flex-end" gap="xs">
                                    <Badge
                                        label={session?.endTs ? 'Ended' : 'Live'}
                                        variant={session?.endTs ? 'default' : 'brand'}
                                        size="small"
                                    />
                                    <DoodleWave width={80} height={20} color="accentBrand" />
                                </Box>
                            </Box>

                            <Box flexDirection="row" gap="s">
                                <Button
                                    label="+ Problem"
                                    variant="primary"
                                    size="medium"
                                    onPress={handleAddProblem}
                                />
                                <Button
                                    label="End Session"
                                    variant="ghost"
                                    size="medium"
                                    onPress={handleEndSession}
                                />
                            </Box>

                            <Box flexDirection="row" gap="s">
                                <StatChip
                                    label="Problems"
                                    value={problems.length}
                                    accent="textPrimary"
                                />
                                <StatChip
                                    label="Sends"
                                    value={sendCount}
                                    accent="statusSuccess"
                                />
                                <StatChip
                                    label="Flashes"
                                    value={flashCount}
                                    accent="accentBrand"
                                />
                            </Box>
                        </Box>
                    </ScreenReveal>

                    <ScreenReveal delay={120}>
                        {loading ? (
                            <Card variant="outlined">
                                <Text variant="bodyMedium" color="textMuted">
                                    Loading problems...
                                </Text>
                            </Card>
                        ) : problems.length === 0 ? (
                            <Card variant="outlined">
                                <Text variant="bodyMedium" color="textMuted">
                                    No problems yet. Add one.
                                </Text>
                            </Card>
                        ) : (
                            <Box gap="m">
                                {problems.map((problem) =>
                                    problem.imageUri ? (
                                        <ProblemCard
                                            key={problem.problemId}
                                            imageSource={{ uri: problem.imageUri }}
                                            maskSource={
                                                problem.maskUri
                                                    ? { uri: problem.maskUri }
                                                    : undefined
                                            }
                                            showMask={Boolean(problem.maskUri)}
                                            outcome={problem.outcome ?? undefined}
                                            gradeLabel={problem.gradeLabel ?? undefined}
                                            attempts={problem.attemptsCount ?? undefined}
                                            compact
                                            onPress={() =>
                                                router.push(`/problem/${problem.problemId}`)
                                            }
                                        />
                                    ) : (
                                        <Card key={problem.problemId} variant="outlined">
                                            <Text variant="bodyMedium" color="textMuted">
                                                Photo unavailable
                                            </Text>
                                        </Card>
                                    )
                                )}
                            </Box>
                        )}
                    </ScreenReveal>
                </Box>
            </ScrollView>
        </Box>
    );
}
