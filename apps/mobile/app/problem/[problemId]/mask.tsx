import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Box, Button, Card, SegmentedControl, Text } from '@crux/ui';
import {
    Canvas,
    Image as SkiaImage,
    Path,
    Skia,
    useImage,
    type SkPath,
    type SkImage,
} from '@shopify/react-native-skia';
import { getProblemById } from '@/features/problem';
import {
    applyBrushToMask,
    createMaskImage,
    getActiveRouteMaskForProblem,
    loadMaskPixels,
    maskTint,
    saveEditedMaskForProblem,
} from '@/features/mask';

const MODE_OPTIONS = [
    { value: 'add', label: 'Add' },
    { value: 'erase', label: 'Erase' },
] as const;

const BRUSH_OPTIONS = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
] as const;

export default function MaskEditorScreen() {
    const router = useRouter();
    const { problemId } = useLocalSearchParams<{ problemId: string }>();
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [maskImage, setMaskImage] = useState<SkImage | null>(null);
    const [maskSize, setMaskSize] = useState<{ width: number; height: number } | null>(null);
    const [maskMissing, setMaskMissing] = useState(false);
    const [viewWidth, setViewWidth] = useState<number | null>(null);
    const [viewHeight, setViewHeight] = useState<number | null>(null);
    const [mode, setMode] = useState<'add' | 'erase'>('add');
    const [brushSize, setBrushSize] = useState<'small' | 'medium' | 'large'>('medium');
    const [strokePath, setStrokePath] = useState<SkPath | null>(null);
    const [saving, setSaving] = useState(false);

    const maskRef = useRef<Uint8Array | null>(null);
    const maskRgbaRef = useRef<Uint8Array | null>(null);
    const strokeRef = useRef<SkPath | null>(null);

    const photoImage = useImage(photoUri ?? undefined);

    const refreshMaskImage = useCallback(() => {
        if (!maskRgbaRef.current || !maskSize) return;
        const image = createMaskImage({
            rgba: maskRgbaRef.current,
            width: maskSize.width,
            height: maskSize.height,
        });
        setMaskImage(image);
    }, [maskSize]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!problemId) return;
            const problem = await getProblemById(problemId);
            if (!problem || !active) return;
            setPhotoUri(problem.media?.localPath ?? null);

            const mask = await getActiveRouteMaskForProblem(problemId);
            if (!mask?.localPath || !active) {
                setMaskMissing(true);
                return;
            }
            setMaskMissing(false);
            const loaded = await loadMaskPixels(mask.localPath);
            if (!active) return;
            maskRef.current = loaded.mask;
            maskRgbaRef.current = loaded.rgba;
            setMaskSize({ width: loaded.width, height: loaded.height });
            const image = createMaskImage({
                rgba: loaded.rgba,
                width: loaded.width,
                height: loaded.height,
            });
            setMaskImage(image);
        };

        void load();
        return () => {
            active = false;
        };
    }, [problemId]);

    useEffect(() => {
        if (!viewWidth || !maskSize) return;
        setViewHeight((viewWidth * maskSize.height) / maskSize.width);
    }, [viewWidth, maskSize]);

    const brushRadius = useMemo(() => {
        if (!maskSize) return 6;
        const base = Math.max(4, Math.round(maskSize.width * 0.01));
        if (brushSize === 'small') return base;
        if (brushSize === 'large') return Math.round(base * 2.4);
        return Math.round(base * 1.6);
    }, [brushSize, maskSize]);

    const strokeWidth = useMemo(() => {
        if (!maskSize || !viewWidth || !viewHeight) return 8;
        const scale = maskSize.width / viewWidth;
        const viewRadius = brushRadius / scale;
        return viewRadius * 2;
    }, [brushRadius, maskSize, viewWidth, viewHeight]);

    const applyBrushAtPoint = useCallback(
        (x: number, y: number) => {
            if (!maskRef.current || !maskRgbaRef.current || !maskSize) return;
            if (!viewWidth || !viewHeight) return;
            const scaleX = maskSize.width / viewWidth;
            const scaleY = maskSize.height / viewHeight;
            const maskX = Math.round(x * scaleX);
            const maskY = Math.round(y * scaleY);
            applyBrushToMask({
                mask: maskRef.current,
                rgba: maskRgbaRef.current,
                width: maskSize.width,
                height: maskSize.height,
                x: maskX,
                y: maskY,
                radius: brushRadius,
                mode,
            });
        },
        [brushRadius, maskSize, mode, viewHeight, viewWidth]
    );

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: (evt) => {
                    const { locationX, locationY } = evt.nativeEvent;
                    const path = Skia.Path.Make();
                    path.moveTo(locationX, locationY);
                    strokeRef.current = path;
                    setStrokePath(path.copy());
                    applyBrushAtPoint(locationX, locationY);
                },
                onPanResponderMove: (evt) => {
                    const { locationX, locationY } = evt.nativeEvent;
                    if (strokeRef.current) {
                        strokeRef.current.lineTo(locationX, locationY);
                        setStrokePath(strokeRef.current.copy());
                    }
                    applyBrushAtPoint(locationX, locationY);
                },
                onPanResponderRelease: () => {
                    strokeRef.current = null;
                    setStrokePath(null);
                    refreshMaskImage();
                },
                onPanResponderTerminate: () => {
                    strokeRef.current = null;
                    setStrokePath(null);
                    refreshMaskImage();
                },
            }),
        [applyBrushAtPoint, refreshMaskImage]
    );

    const handleSave = async () => {
        if (!problemId || !maskRef.current || !maskSize) return;
        setSaving(true);
        await saveEditedMaskForProblem({
            problemId,
            mask: maskRef.current,
            width: maskSize.width,
            height: maskSize.height,
        });
        setSaving(false);
        router.back();
    };

    const loading = !photoUri || (!maskImage && !maskMissing) || (!maskSize && !maskMissing);

    return (
        <Box flex={1} backgroundColor="bgCanvas" padding="m" gap="m">
            <Box flexDirection="row" justifyContent="space-between">
                <Button
                    label="Back"
                    variant="secondary"
                    size="small"
                    onPress={() => router.back()}
                />
                <Button
                    label={saving ? 'Saving...' : 'Save'}
                    variant="primary"
                    size="small"
                    onPress={handleSave}
                    disabled={saving || !maskRef.current}
                />
            </Box>

            <Box gap="s">
                <Text variant="headingSmall" color="textPrimary">
                    Edit Mask
                </Text>
                <Text variant="bodySmall" color="textSecondary">
                    Paint to add or erase holds, then save a new version.
                </Text>
            </Box>

            {maskMissing ? (
                <Card variant="outlined">
                    <Text variant="bodyMedium" color="textMuted">
                        Mask not ready yet. Capture a new photo or wait for the
                        auto mask to finish.
                    </Text>
                </Card>
            ) : loading ? (
                <Card variant="outlined">
                    <Text variant="bodyMedium" color="textMuted">
                        Loading mask...
                    </Text>
                </Card>
            ) : (
                <Box
                    onLayout={(event) =>
                        setViewWidth(event.nativeEvent.layout.width)
                    }
                    {...panResponder.panHandlers}
                >
                    {viewWidth && viewHeight && (
                        <Canvas style={{ width: viewWidth, height: viewHeight }}>
                            {photoImage && (
                                <SkiaImage
                                    image={photoImage}
                                    x={0}
                                    y={0}
                                    width={viewWidth}
                                    height={viewHeight}
                                    fit="cover"
                                />
                            )}
                            {maskImage && (
                                <SkiaImage
                                    image={maskImage}
                                    x={0}
                                    y={0}
                                    width={viewWidth}
                                    height={viewHeight}
                                    fit="cover"
                                    opacity={0.7}
                                />
                            )}
                            {strokePath && (
                                <Path
                                    path={strokePath}
                                    color={
                                        mode === 'add'
                                            ? `rgba(${maskTint.r}, ${maskTint.g}, ${maskTint.b}, 0.8)`
                                            : 'rgba(255, 90, 90, 0.8)'
                                    }
                                    style="stroke"
                                    strokeWidth={strokeWidth}
                                    strokeJoin="round"
                                    strokeCap="round"
                                />
                            )}
                        </Canvas>
                    )}
                </Box>
            )}

            <Box gap="s">
                <Text variant="labelLarge" color="textSecondary">
                    Mode
                </Text>
                <SegmentedControl<'add' | 'erase'>
                    options={[...MODE_OPTIONS]}
                    value={mode}
                    onChange={setMode}
                />
            </Box>

            <Box gap="s">
                <Text variant="labelLarge" color="textSecondary">
                    Brush size
                </Text>
                <SegmentedControl<'small' | 'medium' | 'large'>
                    options={[...BRUSH_OPTIONS]}
                    value={brushSize}
                    onChange={setBrushSize}
                />
            </Box>
        </Box>
    );
}
