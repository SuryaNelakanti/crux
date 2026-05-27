import { Box, Button, Card, Text } from '@crux/ui';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { CaptureButton } from '@/components/CaptureButton';
import { generateAutoMaskForProblem } from '@/features/mask';
import { createProblemFromPhoto } from '@/features/problem';
import { processCapturedPhoto } from '@/lib/media';

export default function CameraScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleCreateProblem = async (photo: { uri: string; width: number; height: number }) => {
    if (!sessionId) return;
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
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !sessionId || processing || uploading) return;
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
      await handleCreateProblem(photo);
    } finally {
      setProcessing(false);
    }
  };

  const handleUpload = async () => {
    if (!sessionId || processing || uploading) return;
    try {
      setUploading(true);
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setUploading(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        exif: false,
      });
      if (result.canceled || result.assets.length === 0) {
        setUploading(false);
        return;
      }
      const asset = result.assets[0];
      if (!asset.uri || !asset.width || !asset.height) {
        setUploading(false);
        return;
      }
      await handleCreateProblem({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
    } finally {
      setUploading(false);
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
        <Button label="Cancel" variant="secondary" size="medium" onPress={() => router.back()} />
      </Box>
    );
  }

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <CameraView ref={cameraRef} style={{ flex: 1 }} />

      <Box position="absolute" left={0} right={0} top={0} padding="m">
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
              Frame the route
            </Text>
            <Text variant="bodySmall" color="textInverse">
              Capture now, fix the mask only if needed.
            </Text>
          </Box>
          <Button label="Cancel" variant="ghost" size="small" onPress={() => router.back()} />
        </Box>
      </Box>

      <Box position="absolute" left={0} right={0} bottom={0} padding="l">
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
            label={uploading ? 'Uploading...' : 'Upload Photo'}
            variant="secondary"
            size="small"
            onPress={handleUpload}
            disabled={processing || uploading}
          />
        </Box>
      </Box>
    </Box>
  );
}
