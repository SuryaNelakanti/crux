import type { Outcome } from '@crux/shared';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const outcomeLabels: Record<Outcome, string> = {
  flash: 'Flash',
  send: 'Sent',
  tried: 'Tried',
  project: 'Project',
};

export function ClimbCard({
  problemId,
  imageUrl,
  maskUrl,
  outcome,
  gradeLabel,
  attemptsCount,
}: {
  problemId: string;
  imageUrl: string | null;
  maskUrl: string | null;
  outcome: Outcome | null;
  gradeLabel: string | null;
  attemptsCount: number | null;
}) {
  return (
    <Button
      variant="ghost"
      asChild
      className="group h-auto min-w-0 flex-col items-stretch justify-start gap-0 overflow-hidden border border-border bg-card p-0 text-left hover:border-foreground/20 hover:bg-card focus-visible:ring-offset-2"
    >
      <Link to={`/problem/${problemId}`}>
        <div className="relative aspect-[3/4] overflow-hidden bg-muted">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Captured bouldering problem"
              className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.015]"
            />
          ) : (
            <div className="grid size-full place-items-center text-xs text-muted-foreground">
              Photo unavailable
            </div>
          )}
          {maskUrl ? (
            <img
              src={maskUrl}
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-cover"
            />
          ) : null}
          <div className="absolute right-2 bottom-2">
            <Badge
              variant={outcome ? 'secondary' : 'outline'}
              className={cn(
                'border-background/30 bg-background/90 text-foreground backdrop-blur-sm',
                outcome === 'flash' && 'text-status-flash',
                outcome === 'send' && 'text-status-send'
              )}
            >
              {outcome ? outcomeLabels[outcome] : 'Add outcome'}
            </Badge>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 border-t border-border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{gradeLabel ?? 'Grade not recorded'}</p>
            <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
              {attemptsCount
                ? `${attemptsCount} ${attemptsCount === 1 ? 'attempt' : 'attempts'}`
                : 'Open climb details'}
            </p>
          </div>
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </div>
      </Link>
    </Button>
  );
}
