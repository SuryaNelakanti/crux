export function DoodleWave({ color = 'var(--brand)' }: { color?: string }) {
  return (
    <svg className="doodle" viewBox="0 0 96 28" fill="none">
      <path
        d="M4 18 C16 6, 28 24, 40 12 C52 0, 64 26, 76 10 C84 2, 92 20, 92 20"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sparkle({ color = 'var(--brand)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 1 L10.8 7.2 L17 9 L10.8 10.8 L9 17 L7.2 10.8 L1 9 L7.2 7.2 Z"
        stroke={color}
        strokeWidth="1.8"
      />
    </svg>
  );
}
