import { useMemo } from 'react';
import { useTheme } from '@shopify/restyle';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Box } from '@crux/ui';
import type { Theme } from '@crux/theme';

export function DoodleWave({
    width = 120,
    height = 24,
    color = 'accentBrand',
}: {
    width?: number;
    height?: number;
    color?: keyof Theme['colors'];
}) {
    const theme = useTheme<Theme>();
    const path = useMemo(() => {
        const wave = Skia.Path.Make();
        wave.moveTo(2, height * 0.6);
        wave.cubicTo(
            width * 0.2,
            height * 0.05,
            width * 0.35,
            height * 0.95,
            width * 0.55,
            height * 0.45
        );
        wave.cubicTo(
            width * 0.75,
            height * 0.1,
            width * 0.9,
            height * 0.9,
            width - 2,
            height * 0.35
        );
        return wave;
    }, [height, width]);

    return (
        <Box width={width} height={height}>
            <Canvas style={{ width, height }}>
                <Path
                    path={path}
                    color={theme.colors[color]}
                    style="stroke"
                    strokeWidth={2.4}
                    strokeCap="round"
                    strokeJoin="round"
                />
            </Canvas>
        </Box>
    );
}

export function Sparkle({
    size = 18,
    color = 'accentBrand',
}: {
    size?: number;
    color?: keyof Theme['colors'];
}) {
    const theme = useTheme<Theme>();
    const path = useMemo(() => {
        const star = Skia.Path.Make();
        const mid = size / 2;
        const tip = size * 0.08;
        star.moveTo(mid, tip);
        star.lineTo(mid + tip, mid - tip);
        star.lineTo(size - tip, mid);
        star.lineTo(mid + tip, mid + tip);
        star.lineTo(mid, size - tip);
        star.lineTo(mid - tip, mid + tip);
        star.lineTo(tip, mid);
        star.lineTo(mid - tip, mid - tip);
        star.close();
        return star;
    }, [size]);

    return (
        <Box width={size} height={size}>
            <Canvas style={{ width: size, height: size }}>
                <Path path={path} color={theme.colors[color]} style="stroke" strokeWidth={2} />
            </Canvas>
        </Box>
    );
}
