import { ArrowRight, ImagePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell, CaptureDock } from '@/components/AppShell';
import { ClimbCard } from '@/components/ClimbCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import {
  createOrReuseActiveSession,
  createProblemFromUpload,
  fetchProblemsForSession,
  fetchSessions,
} from '@/lib/api';

type Sessions = Awaited<ReturnType<typeof fetchSessions>>;
type Problems = Awaited<ReturnType<typeof fetchProblemsForSession>>;

const formatSessionDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

const formatSessionMoment = (date: Date) => {
  const hour = date.getHours();
  const moment = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'night';
  return `${date.toLocaleDateString(undefined, { weekday: 'long' })} ${moment}`;
};

export function SessionsRoute() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [sessions, setSessions] = useState<Sessions>([]);
  const [activeProblems, setActiveProblems] = useState<Problems>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionRows = await fetchSessions();
      const active = sessionRows.find((session) => !session.endTs);
      const problems = active ? await fetchProblemsForSession(active.id) : [];
      setSessions(sessionRows);
      setActiveProblems(problems);
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

  const handleCapture = () => fileRef.current?.click();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const sessionId = await createOrReuseActiveSession();
      const problemId = await createProblemFromUpload({ sessionId, file });
      navigate(`/problem/${problemId}`);
    } catch (captureError) {
      setError(
        captureError instanceof Error ? captureError.message : 'The photo could not be processed.'
      );
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const activeSession = sessions.find((session) => !session.endTs) ?? null;
  const previousSessions = sessions.filter((session) => session.endTs);

  return (
    <AppShell>
      <div className="pb-24 sm:pb-28">
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Could not complete that action</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <output className="block space-y-6" aria-label="Loading tonight's session">
            <div>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="mt-3 h-4 w-56" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Skeleton className="aspect-[3/4]" />
              <Skeleton className="aspect-[3/4]" />
              <Skeleton className="hidden aspect-[3/4] sm:block" />
            </div>
          </output>
        ) : activeSession ? (
          <>
            <section className="mb-8" aria-labelledby="tonight-heading">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant="outline" className="text-status-flash">
                      Live
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {activeSession.problemCount}{' '}
                      {activeSession.problemCount === 1 ? 'climb' : 'climbs'}
                    </span>
                  </div>
                  <h1 id="tonight-heading" className="text-3xl font-semibold tracking-tight">
                    {formatSessionMoment(activeSession.startTs)}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatSessionDate(activeSession.startTs)} · Saved locally
                  </p>
                </div>
                <Button variant="ghost" asChild className="shrink-0">
                  <Link to={`/session/${activeSession.id}`}>
                    Details
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </section>

            <section aria-labelledby="film-heading">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 id="film-heading" className="text-base font-semibold">
                    Session film
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tap a climb to edit its outcome or route.
                  </p>
                </div>
              </div>

              {activeProblems.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {activeProblems.map((problem) => (
                    <ClimbCard key={problem.problemId} {...problem} />
                  ))}
                  <Button
                    variant="ghost"
                    onClick={handleCapture}
                    disabled={uploading}
                    className="group grid h-auto aspect-[3/4] min-h-44 place-items-center rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center hover:border-primary/50 hover:bg-muted/50"
                  >
                    <span>
                      <ImagePlus
                        aria-hidden="true"
                        className="mx-auto mb-3 size-5 text-muted-foreground group-hover:text-primary"
                      />
                      <strong className="block text-sm font-medium">
                        {uploading ? 'Tracing route…' : 'Add the next climb'}
                      </strong>
                    </span>
                  </Button>
                </div>
              ) : (
                <Empty className="min-h-80 border border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ImagePlus aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>Start tonight’s film</EmptyTitle>
                    <EmptyDescription>
                      Take a route photo. Crux will trace the holds before asking how it went.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={handleCapture}>Capture first climb</Button>
                  </EmptyContent>
                </Empty>
              )}
            </section>
          </>
        ) : (
          <Empty className="min-h-[52dvh] border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImagePlus aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No active session</EmptyTitle>
              <EmptyDescription>
                Capture a route to start tonight’s session automatically.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={handleCapture}>Capture first climb</Button>
            </EmptyContent>
          </Empty>
        )}

        <section id="journal" className="mt-14 scroll-mt-20" aria-labelledby="journal-heading">
          <div className="mb-4">
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Your climbing memory
            </p>
            <h2 id="journal-heading" className="mt-1 text-xl font-semibold">
              Journal
            </h2>
          </div>
          {previousSessions.length > 0 ? (
            <div className="border-y border-border">
              {previousSessions.map((session) => (
                <Link key={session.id} to={`/session/${session.id}`} className="session-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {formatSessionDate(session.startTs)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {session.problemCount} climbs · {session.flashCount} flashed ·{' '}
                      {session.sendCount} sent
                    </p>
                  </div>
                  <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="border-y border-border py-6 text-sm text-muted-foreground">
              Finished sessions will live here.
            </p>
          )}
        </section>

        <CaptureDock onCapture={handleCapture} uploading={uploading} />
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
