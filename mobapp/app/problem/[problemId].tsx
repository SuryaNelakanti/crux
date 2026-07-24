import { AUTO_MASK_CONFIDENCE_THRESHOLD, type Outcome } from '@crux/shared';
import type { Theme } from '@crux/theme';
import { Badge, Box, Button, Card, ProblemCard, SegmentedControl, Text, TextField } from '@crux/ui';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@shopify/restyle';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { ScreenReveal } from '@/components/ScreenReveal';
import {
  createBlankMaskForProblem,
  generateAutoMaskForProblem,
  getActiveRouteMaskForProblem,
} from '@/features/mask';
import { getProblemById, getUserProblemLog, upsertUserProblemLog } from '@/features/problem';

const OUTCOME_OPTIONS = [
  { value: 'flash', label: 'Flash' },
  { value: 'send', label: 'Sent' },
  { value: 'tried', label: 'Tried' },
] as const;

const MASK_VIEW_OPTIONS = [
  { value: 'photo', label: 'Photo' },
  { value: 'mask', label: 'Mask' },
] as const;

export default function ProblemDetailScreen() {
  const router = useRouter();
  const theme = useTheme<Theme>();
  const { problemId } = useLocalSearchParams<{ problemId: string }>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [maskUri, setMaskUri] = useState<string | null>(null);
  const [maskConfidence, setMaskConfidence] = useState<number | null>(null);
  const [maskView, setMaskView] = useState<'photo' | 'mask'>('photo');
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [maskBusy, setMaskBusy] = useState(false);
  const [maskError, setMaskError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
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
        if (result.media?.width && result.media?.height) {
          setImageSize({ width: result.media.width, height: result.media.height });
        }

        const mask = await getActiveRouteMaskForProblem(problemId);
        if (active) {
          setMaskUri(mask?.localPath ?? null);
          setMaskConfidence(mask?.confidence ?? null);
          setMaskView(mask?.localPath ? 'mask' : 'photo');
          setMaskError(null);
        }

        if (result.problem.createdInSessionId) {
          const log = await getUserProblemLog(problemId, result.problem.createdInSessionId);
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

  const handleSave = async (selectedOutcome = outcome, returnToSession = true) => {
    if (!problemId || !sessionId || !selectedOutcome) return;
    setSaving(true);
    const attemptsCount = attempts ? Number(attempts) : null;
    const gradeMinValue = gradeMin ? Number(gradeMin) : null;
    const gradeMaxValue = gradeMax ? Number(gradeMax) : null;

    await upsertUserProblemLog({
      problemId,
      sessionId,
      outcome: selectedOutcome,
      attemptsCount: Number.isNaN(attemptsCount) ? null : attemptsCount,
      gradeMin: Number.isNaN(gradeMinValue) ? null : gradeMinValue,
      gradeMax: Number.isNaN(gradeMaxValue) ? null : gradeMaxValue,
      note: note.trim() === '' ? null : note.trim(),
    });
    setSaving(false);
    if (returnToSession) router.replace(`/session/${sessionId}`);
  };

  const handleRetryMask = async () => {
    if (!problemId || !imageUri || maskBusy) return;
    try {
      setMaskBusy(true);
      setMaskError(null);
      await generateAutoMaskForProblem({
        problemId,
        photoUri: imageUri,
      });
      const mask = await getActiveRouteMaskForProblem(problemId);
      setMaskUri(mask?.localPath ?? null);
      setMaskConfidence(mask?.confidence ?? null);
      setMaskView(mask?.localPath ? 'mask' : 'photo');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Auto mask failed';
      setMaskError(message);
    } finally {
      setMaskBusy(false);
    }
  };

  const handleCreateBlankMask = async () => {
    if (!problemId || !imageSize || maskBusy) return;
    try {
      setMaskBusy(true);
      setMaskError(null);
      await createBlankMaskForProblem({
        problemId,
        width: imageSize.width,
        height: imageSize.height,
      });
      const mask = await getActiveRouteMaskForProblem(problemId);
      setMaskUri(mask?.localPath ?? null);
      setMaskConfidence(mask?.confidence ?? null);
      setMaskView(mask?.localPath ? 'mask' : 'photo');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Blank mask failed';
      setMaskError(message);
    } finally {
      setMaskBusy(false);
    }
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
            <Box gap="m">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                <Button label="Back" variant="ghost" size="small" onPress={() => router.back()} />
                <Badge
                  label={sessionId ? 'In session' : 'Problem'}
                  variant="default"
                  size="small"
                />
              </Box>

              {imageUri ? (
                <ProblemCard
                  imageSource={{ uri: imageUri }}
                  maskSource={maskUri ? { uri: maskUri } : undefined}
                  showMask={maskView === 'mask'}
                  outcome={outcome ?? undefined}
                />
              ) : (
                <Card variant="outlined">
                  <Text variant="bodyMedium" color="textMuted">
                    Photo unavailable
                  </Text>
                </Card>
              )}

              {maskUri ? (
                <Box gap="s">
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                    <Text variant="labelLarge" color="textSecondary">
                      Mask overlay
                    </Text>
                    <Badge
                      label={
                        maskConfidence !== null && maskConfidence < AUTO_MASK_CONFIDENCE_THRESHOLD
                          ? 'Low confidence'
                          : 'Ready'
                      }
                      variant={
                        maskConfidence !== null && maskConfidence < AUTO_MASK_CONFIDENCE_THRESHOLD
                          ? 'warning'
                          : 'brand'
                      }
                      size="small"
                    />
                  </Box>
                  <SegmentedControl<'photo' | 'mask'>
                    options={[...MASK_VIEW_OPTIONS]}
                    value={maskView}
                    onChange={setMaskView}
                  />
                </Box>
              ) : (
                <Card variant="outlined">
                  <Box gap="s">
                    <Text variant="bodyMedium" color="textMuted">
                      {maskBusy ? 'Generating mask...' : 'Mask not ready yet.'}
                    </Text>
                    <Button
                      label={maskBusy ? 'Working...' : 'Retry Auto Mask'}
                      variant="secondary"
                      size="small"
                      onPress={handleRetryMask}
                      disabled={maskBusy || !imageUri}
                    />
                    <Button
                      label={maskBusy ? 'Working...' : 'Create Blank Mask'}
                      variant="ghost"
                      size="small"
                      onPress={handleCreateBlankMask}
                      disabled={maskBusy || !imageSize}
                    />
                    {maskError ? (
                      <Text variant="bodySmall" color="statusError">
                        {maskError}
                      </Text>
                    ) : null}
                  </Box>
                </Card>
              )}

              <Box gap="s">
                <Button
                  label="Edit Mask"
                  variant="secondary"
                  size="medium"
                  onPress={() =>
                    problemId ? router.push(`/problem/${problemId}/mask`) : undefined
                  }
                  disabled={!imageUri || !maskUri}
                />
                {maskConfidence !== null && maskConfidence < AUTO_MASK_CONFIDENCE_THRESHOLD && (
                  <Card variant="outlined">
                    <Text variant="bodyMedium" color="textMuted">
                      Low confidence. Edit only if the overlay misses the route.
                    </Text>
                  </Card>
                )}
              </Box>
            </Box>
          </ScreenReveal>

          <ScreenReveal delay={120}>
            <Box gap="m">
              <Text variant="headingSmall" color="textPrimary">
                What happened?
              </Text>
              <Box gap="s">
                {OUTCOME_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    label={saving ? 'Saving...' : option.label}
                    variant={outcome === option.value ? 'primary' : 'secondary'}
                    size="large"
                    onPress={() => {
                      setOutcome(option.value);
                      void handleSave(option.value);
                    }}
                    disabled={saving || !sessionId}
                  />
                ))}
              </Box>
            </Box>
          </ScreenReveal>

          <ScreenReveal delay={180}>
            <Box gap="m">
              <Text variant="labelLarge" color="textSecondary">
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
          </ScreenReveal>

          <ScreenReveal delay={220}>
            <Box gap="m">
              <Text variant="labelLarge" color="textSecondary">
                Grade range
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
          </ScreenReveal>

          <ScreenReveal delay={260}>
            <Box gap="m">
              <Text variant="labelLarge" color="textSecondary">
                Note
              </Text>
              <TextField
                placeholder="Optional note"
                value={note}
                onChangeText={setNote}
                multiline
              />
            </Box>
          </ScreenReveal>

          <ScreenReveal delay={300}>
            {outcome ? (
              <Button
                label={saving ? 'Saving...' : 'Update details'}
                variant="secondary"
                size="large"
                onPress={() => void handleSave(outcome, false)}
                disabled={saving || !sessionId}
              />
            ) : null}
          </ScreenReveal>
        </Box>
      </ScrollView>
    </Box>
  );
}
