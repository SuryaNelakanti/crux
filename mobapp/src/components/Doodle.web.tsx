import type { Theme } from '@crux/theme';
import { Box } from '@crux/ui';

export function DoodleWave({
  width = 120,
  height = 24,
  color = 'accentBrand',
}: {
  width?: number;
  height?: number;
  color?: keyof Theme['colors'];
}) {
  const segments = [0.35, 0.7, 0.25, 0.6, 0.3, 0.55].map((ratio, index) => ({
    id: `segment-${ratio}-${index}`,
    ratio,
  }));
  const gap = 2;
  const segmentWidth = Math.max(
    6,
    Math.floor((width - gap * (segments.length - 1)) / segments.length)
  );

  return (
    <Box width={width} height={height} flexDirection="row" alignItems="flex-end" gap="2xs">
      {segments.map((segment, index) => (
        <Box
          key={segment.id}
          width={segmentWidth}
          height={Math.max(3, Math.round(height * segment.ratio))}
          borderRadius="full"
          backgroundColor={color}
          style={{
            opacity: 0.85,
            transform: [{ rotate: index % 2 === 0 ? '-6deg' : '6deg' }],
          }}
        />
      ))}
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
  const stroke = Math.max(2, Math.round(size * 0.16));
  const arm = Math.max(6, Math.round(size * 0.55));

  return (
    <Box width={size} height={size} alignItems="center" justifyContent="center">
      <Box
        width={arm}
        height={stroke}
        borderRadius="full"
        backgroundColor={color}
        style={{ opacity: 0.9 }}
      />
      <Box
        position="absolute"
        width={stroke}
        height={arm}
        borderRadius="full"
        backgroundColor={color}
        style={{ opacity: 0.9 }}
      />
    </Box>
  );
}
