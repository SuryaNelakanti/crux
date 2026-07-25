import { ArrowRight, BookOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, CaptureDock } from '@/components/AppShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCaptureFlow } from '@/hooks/useCaptureFlow';
import { fetchSessions } from '@/lib/api';
import {
  formatSessionDate,
  formatSessionMonth,
  formatSessionTime,
  formatSessionWeekday,
} from '@/lib/session-format';

type Sessions = Awaited<ReturnType<typeof fetchSessions>>;

const groupSessionsByMonth = (sessions: Sessions) => {
  const groups = new Map<string, Sessions>();
  for (const session of sessions) {
    const month = formatSessionMonth(session.startTs);
    const group = groups.get(month);
    if (group) {
      group.push(session);
    } else {
      groups.set(month, [session]);
    }
  }
  return [...groups.entries()];
};

const formatOutcomeSummary = (session: Sessions[number]) => {
  const parts = [`${session.problemCount} ${session.problemCount === 1 ? 'climb' : 'climbs'}`];
  if (session.flashCount > 0) {
    parts.push(`${session.flashCount} ${session.flashCount === 1 ? 'flash' : 'flashes'}`);
  }
  if (session.sendCount > 0) {
    parts.push(`${session.sendCount} sent`);
  }
  return parts.join(' · ');
};

export function JournalRoute() {
  const [sessions, setSessions] = useState<Sessions>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { captureError, fileRef, handleFile, openCapture, uploading } = useCaptureFlow();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionRows = await fetchSessions();
      setSessions(sessionRows.filter((session) => session.endTs));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Your journal could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleError = error ?? captureError;
  const monthGroups = groupSessionsByMonth(sessions);

  return (
    <AppShell>
      <div className="pb-24 sm:pb-28">
        <header className="mb-8 border-b border-border pb-6">
          <p className="mb-2 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Your climbing memory
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Journal</h1>
          <p className="mt-2 text-sm text-muted-foreground">Finished sessions, kept in order.</p>
        </header>

        {visibleError ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Could not complete that action</AlertTitle>
            <AlertDescription>{visibleError}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <output className="block space-y-8" aria-label="Loading journal">
            {['recent', 'earlier'].map((group) => (
              <div key={group}>
                <Skeleton className="mb-3 h-4 w-28" />
                <div className="space-y-px">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ))}
          </output>
        ) : monthGroups.length > 0 ? (
          <div className="space-y-10">
            {monthGroups.map(([month, monthSessions]) => (
              <section key={month} aria-labelledby={`month-${month.replaceAll(' ', '-')}`}>
                <h2
                  id={`month-${month.replaceAll(' ', '-')}`}
                  className="mb-3 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase"
                >
                  {month}
                </h2>
                <div className="border-y border-border">
                  {monthSessions.map((session) => (
                    <Link key={session.id} to={`/session/${session.id}`} className="session-row">
                      <time
                        dateTime={session.startTs.toISOString()}
                        className="grid size-12 shrink-0 place-content-center rounded-lg border border-border bg-muted/35 text-center"
                      >
                        <span className="text-lg leading-none font-semibold">
                          {session.startTs.getDate()}
                        </span>
                        <span className="mt-1 text-[0.7rem] leading-none text-muted-foreground uppercase">
                          {formatSessionWeekday(session.startTs)}
                        </span>
                      </time>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {formatSessionDate(session.startTs)}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {formatSessionTime(session.startTs)} · {formatOutcomeSummary(session)}
                        </p>
                      </div>
                      <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Empty className="min-h-[46dvh] border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpen aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No finished sessions yet</EmptyTitle>
              <EmptyDescription>
                Finish a session and it will appear here with its climbs and outcomes.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" asChild>
                <Link to="/tonight">Go to Tonight</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}

        <CaptureDock onCapture={openCapture} uploading={uploading} active="journal" />
        <Input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="absolute !h-px !w-px overflow-hidden p-0 opacity-0"
          aria-label="Choose a route photo"
        />
      </div>
    </AppShell>
  );
}
