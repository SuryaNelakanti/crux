import { useRef, useState, type ChangeEvent } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@shopify/restyle';
import { Badge, Box, Button, Card, Text } from '@crux/ui';
import type { Theme } from '@crux/theme';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { ScreenReveal } from '@/components/ScreenReveal';
import { createProblemFromPhoto } from '@/features/problem';
import { generateAutoMaskForProblem } from '@/features/mask';

export default function CameraWebScreen() {
    const router = useRouter();
    const theme = useTheme<Theme>();
    const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleBack = () => {
        if (sessionId) {
            router.replace(`/session/${sessionId}`);
            return;
        }
        router.back();
    };

    const handlePick = () => {
        fileInputRef.current?.click();
    };

    const loadImageSize = (uri: string) =>
        new Promise<{ width: number; height: number }>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                resolve({
                    width: image.naturalWidth || image.width,
                    height: image.naturalHeight || image.height,
                });
            };
            image.onerror = () => reject(new Error('Unable to load image'));
            image.src = uri;
        });

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !sessionId) return;
        setProcessing(true);
        setError(null);
        try {
            const localPath = URL.createObjectURL(file);
            const { width, height } = await loadImageSize(localPath);
            const result = await createProblemFromPhoto({
                sessionId,
                localPath,
                width,
                height,
                bytes: file.size,
                metadataJson: {
                    filename: file.name,
                    mime: file.type,
                },
            });
            void generateAutoMaskForProblem({
                problemId: result.problemId,
                photoUri: localPath,
            }).catch(() => undefined);
            router.replace(`/problem/${result.problemId}`);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Upload failed';
            setError(message);
        } finally {
            setProcessing(false);
            event.target.value = '';
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
                <ScreenReveal>
                    <Box gap="l">
                        <Box
                            flexDirection="row"
                            justifyContent="space-between"
                            alignItems="center"
                        >
                            <Box gap="xs">
                                <Text variant="headingLarge" color="textPrimary">
                                    Camera
                                </Text>
                                <Text variant="bodySmall" color="textSecondary">
                                    Web preview
                                </Text>
                            </Box>
                            <Box alignItems="flex-end" gap="xs">
                                <Sparkle size={18} color="accentBrand" />
                                <DoodleWave width={84} height={20} color="accentBrand" />
                            </Box>
                        </Box>

                        <Card variant="outlined">
                            <Box gap="s">
                                <Text variant="bodyMedium" color="textSecondary">
                                    Upload a wall photo to create a problem.
                                </Text>
                                <Text variant="bodySmall" color="textMuted">
                                    Web supports photo upload. Mask generation is mobile-only.
                                </Text>
                                <Box flexDirection="row" gap="s" flexWrap="wrap">
                                    <Badge label="Web upload" variant="info" size="small" />
                                    <Badge label="Mask on mobile" variant="brand" size="small" />
                                </Box>
                            </Box>
                        </Card>

                        <Box gap="s">
                            <Button
                                label={processing ? 'Uploading...' : 'Upload Photo'}
                                variant="primary"
                                size="large"
                                onPress={handlePick}
                                disabled={processing}
                            />
                            <Button
                                label="Back to Session"
                                variant="ghost"
                                size="small"
                                onPress={handleBack}
                            />
                            {error ? (
                                <Text variant="bodySmall" color="statusError">
                                    {error}
                                </Text>
                            ) : null}
                        </Box>
                    </Box>
                </ScreenReveal>
            </ScrollView>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />
        </Box>
    );
}
