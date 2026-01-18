import { Badge } from './ui';

export function ProblemCard({
  title,
  subtitle,
  imageUrl,
  maskUrl,
  outcome,
  gradeLabel,
  onClick,
  style,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  maskUrl: string | null;
  outcome: string | null;
  gradeLabel: string | null;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const isInteractive = Boolean(onClick);

  return (
    <button
      type="button"
      className={`card problem-card${onClick ? ' clickable' : ''} reveal`}
      onClick={onClick}
      disabled={!isInteractive}
      aria-disabled={!isInteractive}
      style={{
        padding: 0,
        overflow: 'hidden',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {/* Photo */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingTop: '75%', /* 4:3 aspect ratio */
          background: 'var(--ink-900)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          overflow: 'hidden',
        }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Problem"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        {maskUrl && (
          <img
            className="mask-overlay"
            src={maskUrl}
            alt="Mask"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.7,
            }}
          />
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: 'var(--space-4)', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{title}</div>
            <div className="muted text-sm">{subtitle}</div>
          </div>
          {outcome ? (
            <Badge label={outcome} variant="brand" />
          ) : (
            <Badge label="Log it" variant="neutral" />
          )}
        </div>
        {gradeLabel && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Badge label={gradeLabel} variant="neutral" />
          </div>
        )}
      </div>
    </button>
  );
}
