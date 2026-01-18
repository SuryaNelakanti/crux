import { Badge } from './ui';

export function ProblemCard({
  title,
  subtitle,
  imageUrl,
  maskUrl,
  outcome,
  gradeLabel,
  onClick,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  maskUrl: string | null;
  outcome: string | null;
  gradeLabel: string | null;
  onClick?: () => void;
}) {
  const isInteractive = Boolean(onClick);

  const handleClick = () => {
    if (!isInteractive) return;
    onClick?.();
  };

  return (
    <button
      type="button"
      className={`card problem-card${onClick ? ' clickable' : ''}`}
      onClick={handleClick}
      disabled={!isInteractive}
      aria-disabled={!isInteractive}
    >
      <div className="photo-frame problem-media">
        {imageUrl ? <img src={imageUrl} alt="Problem" /> : null}
        {maskUrl ? <img className="mask-overlay" src={maskUrl} alt="Mask" /> : null}
      </div>
      <div className="problem-meta">
        <div className="problem-header">
          <div>
            <div className="problem-title">{title}</div>
            <div className="problem-subtitle">{subtitle}</div>
          </div>
          {outcome ? (
            <Badge label={outcome} variant="brand" />
          ) : (
            <Badge label="Unlogged" variant="neutral" />
          )}
        </div>
        <div className="pill-group">
          {gradeLabel ? <Badge label={gradeLabel} variant="neutral" /> : null}
          {maskUrl ? (
            <Badge label="Mask ready" variant="brand" />
          ) : (
            <Badge label="Mask pending" variant="warning" />
          )}
        </div>
      </div>
    </button>
  );
}
