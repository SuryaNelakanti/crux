import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Box, Button, Card, Text } from '@crux/ui';
import { createProblemFromPhoto } from '@/features/problem';
import { generateAutoMaskForProblem } from '@/features/mask';
import { processCapturedPhoto } from '@/lib/media';
import { CaptureButton } from '@/components/CaptureButton';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { ScreenReveal } from '@/components/ScreenReveal';

export default function CameraScreen() {
    const router = useRouter();
    const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [processing, setProcessing] = useState(false);

    const handleCapture = async () => {
        if (!cameraRef.current || !sessionId || processing) return;
        try {
            setProcessing(true);
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                exif: false,
            });
            if (!photo) {
                setProcessing(false);
                return;
            }

            const processed = await processCapturedPhoto({
                uri: photo.uri,
                width: photo.width,
                height: photo.height,
            });

            const result = await createProblemFromPhoto({
                sessionId,
                localPath: processed.localPath,
                width: processed.width,
                height: processed.height,
                bytes: processed.bytes,
                metadataJson: {
                    thumbnailPath: processed.thumbnailPath,
                },
            });

            void generateAutoMaskForProblem({
                problemId: result.problemId,
                photoUri: processed.processingPath,
            }).catch(() => undefined);

            router.replace(`/problem/${result.problemId}`);
        } finally {
            setProcessing(false);
        }
    };

    if (!permission) {
        return (
            <Box flex={1} backgroundColor="bgCanvas" padding="m" justifyContent="center">
                <Card variant="outlined">
                    <Text variant="bodyMedium" color="textMuted">
                        Checking camera permission...
                    </Text>
                </Card>
            </Box>
        );
    }

    if (!permission.granted) {
        return (
            <Box flex={1} backgroundColor="bgCanvas" padding="m" justifyContent="center" gap="m">
                <Text variant="headingSmall" color="textPrimary">
                    Camera access needed
                </Text>
                <Text variant="bodyMedium" color="textSecondary">
                    Enable camera access to capture bouldering problems.
                </Text>
                <Button
                    label="Grant Permission"
                    variant="primary"
                    size="large"
                    onPress={requestPermission}
                />
                <Button
                    label="Cancel"
                    variant="secondary"
                    size="medium"
                    onPress={() => router.back()}
                />
            </Box>
        );
    }

    return (
        <Box flex={1} backgroundColor="bgCanvas">
            <CameraView ref={cameraRef} style={{ flex: 1 }} />

            <Box position="absolute" left={0} right={0} top={0} padding="m">
                <ScreenReveal>
                    <Box
                        flexDirection="row"
                        justifyContent="space-between"
                        alignItems="center"
                        padding="m"
                        borderRadius="l"
                        backgroundColor="overlayMedium"
                    >
                        <Box gap="xs">
                            <Text variant="headingSmall" color="textInverse">
                                Frame the wall
                            </Text>
                            <Text variant="bodySmall" color="textInverse">
                                Auto mask will pick the dominant hold color
                            </Text>
                        </Box>
                        <Box alignItems="flex-end" gap="xs">
                            <Sparkle size={18} color="textInverse" />
                            <DoodleWave width={70} height={18} color="textInverse" />
                        </Box>
                    </Box>
                </ScreenReveal>
            </Box>

            <Box position="absolute" left={0} right={0} bottom={0} padding="l">
                <ScreenReveal delay={120}>
                    <Box
                        alignItems="center"
                        gap="s"
                        padding="m"
                        borderRadius="l"
                        backgroundColor="overlayHeavy"
                    >
                        <CaptureButton onPress={handleCapture} disabled={processing} />
                        <Text variant="labelMedium" color="textInverse">
                            {processing ? 'Processing...' : 'Capture problem'}
                        </Text>
                        <Button
                            label="Cancel"
                            variant="ghost"
                            size="small"
                            onPress={() => router.back()}
                            disabled={processing}
                        />
                    </Box>
                </ScreenReveal>
            </Box>
        </Box>
    );
}
