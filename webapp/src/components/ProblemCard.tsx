import type { KeyboardEvent } from 'react';
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
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      className="card"
      style={{ padding: 0, overflow: 'hidden', cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
    >
      <div className="photo-frame" style={{ height: 180 }}>
        {imageUrl ? <img src={imageUrl} alt="Problem" /> : null}
        {maskUrl ? <img className="mask-overlay" src={maskUrl} alt="Mask" /> : null}
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{title}</div>
            <div className="muted" style={{ fontSize: '13px' }}>{subtitle}</div>
          </div>
          {outcome ? <Badge label={outcome} variant="brand" /> : <Badge label="Unlogged" variant="neutral" />}
        </div>
        <div className="pill-group">
          {gradeLabel ? <Badge label={gradeLabel} variant="neutral" /> : null}
          {maskUrl ? <Badge label="Mask ready" variant="brand" /> : <Badge label="Mask pending" variant="warning" />}
        </div>
      </div>
    </div>
  );
}
