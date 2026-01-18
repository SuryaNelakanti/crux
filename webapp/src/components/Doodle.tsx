export function DoodleWave({
  color = 'var(--brand)',
  className,
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg className={className ?? 'doodle'} viewBox="0 0 96 28" fill="none">
      <title>Decorative wave</title>
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

export function Sparkle({
  color = 'var(--brand)',
  className,
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <title>Decorative sparkle</title>
      <path
        d="M9 1 L10.8 7.2 L17 9 L10.8 10.8 L9 17 L7.2 10.8 L1 9 L7.2 7.2 Z"
        stroke={color}
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function DoodleArrow({
  color = 'var(--accent-strong)',
  className,
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg width="64" height="24" viewBox="0 0 64 24" fill="none" className={className}>
      <title>Decorative arrow</title>
      <path d="M2 12 C18 2, 34 22, 54 12" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <path d="M54 12 L46 6 M54 12 L46 18" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function DoodleBolt({
  color = 'var(--signal)',
  className,
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" className={className}>
      <title>Decorative bolt</title>
      <path
        d="M10.5 1 L2 11 H8 L7.5 19 L16 9 H10.5 L10.5 1 Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoodleLoop({
  color = 'var(--brand)',
  className,
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg width="68" height="32" viewBox="0 0 68 32" fill="none" className={className}>
      <title>Decorative loop</title>
      <path
        d="M6 16 C10 4, 26 4, 30 16 C34 28, 50 28, 62 16"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
