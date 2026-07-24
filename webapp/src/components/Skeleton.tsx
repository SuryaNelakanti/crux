export type SkeletonVariant = 'card' | 'image' | 'text' | 'avatar';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
  count?: number;
}

const variantStyles: Record<SkeletonVariant, React.CSSProperties> = {
  card: { height: 160, borderRadius: 'var(--radius-lg)' },
  image: { height: 200, borderRadius: 'var(--radius-lg)' },
  text: { height: 16, width: '60%', borderRadius: 'var(--radius-sm)' },
  avatar: { width: 40, height: 40, borderRadius: '50%' },
};

export function Skeleton({ variant = 'text', className, count = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => `${variant}-${i}`).map((key) => (
        <div
          key={key}
          className={`skeleton ${className ?? ''}`}
          style={variantStyles[variant]}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
