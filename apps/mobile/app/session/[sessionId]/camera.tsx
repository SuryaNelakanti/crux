import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Box, Button, Text, Card } from '@crux/ui';
import { createProblemFromPhoto } from '@/features/problem';
import { generateAutoMaskForProblem } from '@/features/mask';
import { processCapturedPhoto } from '@/lib/media';

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
            <Box
                position="absolute"
                left={0}
                right={0}
                bottom={0}
                padding="l"
                gap="s"
                backgroundColor="bgCanvas"
            >
                <Button
                    label={processing ? 'Processing...' : 'Capture Problem'}
                    variant="primary"
                    size="large"
                    onPress={handleCapture}
                    disabled={processing}
                />
                <Button
                    label="Cancel"
                    variant="secondary"
                    size="medium"
                    onPress={() => router.back()}
                    disabled={processing}
                />
            </Box>
        </Box>
    );
}
