import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Box, Button, Text, ProblemCard, Card } from '@crux/ui';
import { endSession, getSessionById } from '@/features/session';
import {
    getProblemCardsForSession,
    type ProblemCardItem,
} from '@/features/problem';
import { runSync } from '@/lib/sync';

export default function SessionScreen() {
    const router = useRouter();
    const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
    const [problems, setProblems] = useState<ProblemCardItem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!sessionId) return;
        setLoading(true);
        const session = await getSessionById(sessionId);
        if (!session) {
            setLoading(false);
            return;
        }
        const cards = await getProblemCardsForSession(sessionId);
        setProblems(cards);
        setLoading(false);
    }, [sessionId]);

    useEffect(() => {
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

    return (
        <Box flex={1} backgroundColor="bgCanvas" padding="m" gap="m">
            <Box paddingTop="2xl" gap="s">
                <Text variant="headingLarge" color="textPrimary">
                    Session
                </Text>
                <Text variant="bodySmall" color="textSecondary">
                    {sessionId}
                </Text>
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
                    variant="secondary"
                    size="medium"
                    onPress={handleEndSession}
                />
            </Box>

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
                <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                    <Box gap="m">
                        {problems.map((problem) =>
                            problem.imageUri ? (
                                <ProblemCard
                                    key={problem.problemId}
                                    imageSource={{ uri: problem.imageUri }}
                                    showMask={false}
                                    outcome={problem.outcome ?? undefined}
                                    gradeLabel={problem.gradeLabel ?? undefined}
                                    attempts={problem.attemptsCount ?? undefined}
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
                </ScrollView>
            )}
        </Box>
    );
}
