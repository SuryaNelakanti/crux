import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Box, Button, Card, ProblemCard, SegmentedControl, Text, TextField } from '@crux/ui';
import { AUTO_MASK_CONFIDENCE_THRESHOLD, type Outcome } from '@crux/shared';
import {
    getProblemById,
    getUserProblemLog,
    upsertUserProblemLog,
} from '@/features/problem';
import { getActiveRouteMaskForProblem } from '@/features/mask';

const OUTCOME_OPTIONS = [
    { value: 'flash', label: 'Flash' },
    { value: 'send', label: 'Send' },
    { value: 'tried', label: 'Tried' },
    { value: 'project', label: 'Project' },
] as const;

const MASK_VIEW_OPTIONS = [
    { value: 'photo', label: 'Photo' },
    { value: 'mask', label: 'Mask' },
] as const;

export default function ProblemDetailScreen() {
    const router = useRouter();
    const { problemId } = useLocalSearchParams<{ problemId: string }>();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [maskUri, setMaskUri] = useState<string | null>(null);
    const [maskConfidence, setMaskConfidence] = useState<number | null>(null);
    const [maskView, setMaskView] = useState<'photo' | 'mask'>('photo');
    const [outcome, setOutcome] = useState<Outcome>('tried');
    const [attempts, setAttempts] = useState('');
    const [gradeMin, setGradeMin] = useState('');
    const [gradeMax, setGradeMax] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    useFocusEffect(
        useCallback(() => {
            let active = true;
            const load = async () => {
                if (!problemId) return;
                const result = await getProblemById(problemId);
                if (!result || !active) return;

                setSessionId(result.problem.createdInSessionId ?? null);
                setImageUri(result.media?.localPath ?? null);

                const mask = await getActiveRouteMaskForProblem(problemId);
                if (active) {
                    setMaskUri(mask?.localPath ?? null);
                    setMaskConfidence(mask?.confidence ?? null);
                    setMaskView(mask?.localPath ? 'mask' : 'photo');
                }

                if (result.problem.createdInSessionId) {
                    const log = await getUserProblemLog(
                        problemId,
                        result.problem.createdInSessionId
                    );
                    if (log && active) {
                        setOutcome(log.outcome);
                        setAttempts(log.attemptsCount?.toString() ?? '');
                        setGradeMin(log.gradeMin?.toString() ?? '');
                        setGradeMax(log.gradeMax?.toString() ?? '');
                        setNote(log.note ?? '');
                    }
                }
            };

            void load();
            return () => {
                active = false;
            };
        }, [problemId])
    );

    const handleSave = async () => {
        if (!problemId || !sessionId) return;
        setSaving(true);
        const attemptsCount = attempts ? Number(attempts) : null;
        const gradeMinValue = gradeMin ? Number(gradeMin) : null;
        const gradeMaxValue = gradeMax ? Number(gradeMax) : null;

        await upsertUserProblemLog({
            problemId,
            sessionId,
            outcome,
            attemptsCount: Number.isNaN(attemptsCount) ? null : attemptsCount,
            gradeMin: Number.isNaN(gradeMinValue) ? null : gradeMinValue,
            gradeMax: Number.isNaN(gradeMaxValue) ? null : gradeMaxValue,
            note: note.trim() === '' ? null : note.trim(),
        });
        setSaving(false);
        router.back();
    };

    return (
        <Box flex={1} backgroundColor="bgCanvas">
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Box gap="m">
                    <Button
                        label="Back"
                        variant="secondary"
                        size="small"
                        onPress={() => router.back()}
                    />

                <Card variant="outlined">
                    {imageUri ? (
                        <ProblemCard
                            imageSource={{ uri: imageUri }}
                            maskSource={maskUri ? { uri: maskUri } : undefined}
                            showMask={maskView === 'mask'}
                            outcome={outcome}
                        />
                    ) : (
                        <Text variant="bodyMedium" color="textMuted">
                            Photo unavailable
                        </Text>
                    )}
                </Card>

                {maskUri ? (
                    <Box gap="s">
                        <Text variant="labelLarge" color="textSecondary">
                            Mask overlay
                        </Text>
                        <SegmentedControl<'photo' | 'mask'>
                            options={[...MASK_VIEW_OPTIONS]}
                            value={maskView}
                            onChange={setMaskView}
                        />
                    </Box>
                ) : (
                    <Card variant="outlined">
                        <Text variant="bodyMedium" color="textMuted">
                            Generating mask...
                        </Text>
                    </Card>
                )}

                <Box gap="s">
                    <Button
                        label="Edit Mask"
                        variant="secondary"
                        size="medium"
                        onPress={() =>
                            problemId
                                ? router.push(`/problem/${problemId}/mask`)
                                : undefined
                        }
                        disabled={!imageUri}
                    />
                    {maskConfidence !== null &&
                        maskConfidence < AUTO_MASK_CONFIDENCE_THRESHOLD && (
                            <Card variant="outlined">
                                <Text variant="bodyMedium" color="textMuted">
                                    Mask confidence is low. Quick edits usually
                                    fix it.
                                </Text>
                            </Card>
                        )}
                </Box>

                <Box gap="m">
                    <Text variant="headingSmall" color="textPrimary">
                        Log Outcome
                    </Text>
                    <SegmentedControl<Outcome>
                        options={[...OUTCOME_OPTIONS]}
                        value={outcome}
                        onChange={setOutcome}
                    />
                </Box>

                <Box gap="m">
                    <Text variant="headingSmall" color="textPrimary">
                        Attempts
                    </Text>
                    <TextField
                        label="Attempts"
                        placeholder="e.g. 3"
                        keyboardType="number-pad"
                        value={attempts}
                        onChangeText={setAttempts}
                    />
                </Box>

                <Box gap="m">
                    <Text variant="headingSmall" color="textPrimary">
                        Grade Range (V-scale)
                    </Text>
                    <Box flexDirection="row" gap="m">
                        <Box flex={1}>
                            <TextField
                                label="Min"
                                placeholder="e.g. 3"
                                keyboardType="number-pad"
                                value={gradeMin}
                                onChangeText={setGradeMin}
                            />
                        </Box>
                        <Box flex={1}>
                            <TextField
                                label="Max"
                                placeholder="e.g. 4"
                                keyboardType="number-pad"
                                value={gradeMax}
                                onChangeText={setGradeMax}
                            />
                        </Box>
                    </Box>
                </Box>

                <Box gap="m">
                    <Text variant="headingSmall" color="textPrimary">
                        Note
                    </Text>
                    <TextField
                        placeholder="Optional note"
                        value={note}
                        onChangeText={setNote}
                        multiline
                    />
                </Box>

                    <Button
                        label={saving ? 'Saving...' : 'Save Log'}
                        variant="primary"
                        size="large"
                        onPress={handleSave}
                        disabled={saving || !sessionId}
                    />
                </Box>
            </ScrollView>
        </Box>
    );
}
