import { ArrowLeft, Camera, CircleStop, ImagePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell, CaptureDock } from '@/components/AppShell';
import { ClimbCard } from '@/components/ClimbCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  createProblemFromUpload,
  endSession,
  fetchProblemsForSession,
  fetchSessions,
} from '@/lib/api';

type SessionView = {
  id: string;
  title: string;
  time: string;
  isLive: boolean;
  problemCount: number;
  sendCount: number;
  flashCount: number;
};

export function SessionDetailRoute() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [problems, setProblems] = useState<Awaited<ReturnType<typeof fetchProblemsForSession>>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [sessionData, setSessionData] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const [sessions, sessionProblems] = await Promise.all([
        fetchSessions(),
        fetchProblemsForSession(sessionId),
      ]);
      const session = sessions.find((candidate) => candidate.id === sessionId);
      setSessionData(
        session
          ? {
              id: session.id,
              title: session.startTs.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              }),
              time: session.startTs.toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              }),
              isLive: !session.endTs,
              problemCount: session.problemCount,
              sendCount: session.sendCount,
              flashCount: session.flashCount,
            }
          : null
      );
      setProblems(sessionProblems);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The session could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!sessionId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
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

  const handleEnd = async () => {
    if (!sessionId || ending) return;
    setEnding(true);
    setError(null);
    try {
      await endSession(sessionId);
      await load();
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : 'The session could not be finished.');
    } finally {
      setEnding(false);
    }
  };

  if (!sessionId) return null;

  const finishSession = sessionData?.isLive ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={ending}>
          <CircleStop aria-hidden="true" />
          Finish session
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finish this session?</AlertDialogTitle>
          <AlertDialogDescription>
            The climbs stay in your journal. New photos will start a new session.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep climbing</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleEnd()}>
            {ending ? 'Finishing…' : 'Finish session'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return (
    <AppShell width="wide">
      <div className="pb-24 sm:pb-28">
        <Button variant="ghost" onClick={() => navigate('/')} className="-ml-3 mb-6">
          <ArrowLeft aria-hidden="true" />
          Sessions
        </Button>

        <header className="mb-8 flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge
                variant="outline"
                className={sessionData?.isLive ? 'text-status-flash' : undefined}
              >
                {sessionData?.isLive ? 'Live' : 'Finished'}
              </Badge>
              {sessionData ? (
                <span className="text-xs text-muted-foreground">Started {sessionData.time}</span>
              ) : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {sessionData?.title ?? 'Session'}
            </h1>
            {sessionData ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {sessionData.problemCount} climbs · {sessionData.flashCount} flashed ·{' '}
                {sessionData.sendCount} sent
              </p>
            ) : null}
          </div>
          {finishSession}
        </header>

        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Could not complete that action</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section aria-labelledby="session-climbs">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="session-climbs" className="text-sm font-medium">
              Climbs
            </h2>
            <span className="text-xs text-muted-foreground">
              {problems.length} {problems.length === 1 ? 'photo' : 'photos'}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {['first', 'second', 'third', 'fourth'].map((slot) => (
                <Skeleton key={slot} className="aspect-[3/4] w-full" />
              ))}
            </div>
          ) : problems.length === 0 ? (
            <Empty className="min-h-80 border border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImagePlus aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No climbs in this session</EmptyTitle>
                <EmptyDescription>
                  Add a route photo. Crux will trace the holds before asking for the outcome.
                </EmptyDescription>
              </EmptyHeader>
              {sessionData?.isLive ? (
                <EmptyContent>
                  <Button onClick={() => fileRef.current?.click()}>
                    <Camera aria-hidden="true" />
                    Capture first climb
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {problems.map((problem) => (
                <ClimbCard key={problem.problemId} {...problem} />
              ))}
            </div>
          )}
        </section>

        {sessionData?.isLive ? (
          <CaptureDock
            onCapture={() => fileRef.current?.click()}
            uploading={uploading}
            journalHref="/#journal"
          />
        ) : null}

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
