import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FAB } from '@/components/FAB';
import { Skeleton } from '@/components/Skeleton';
import { Badge, Button } from '@/components/ui';
import {
  createProblemFromUpload,
  endSession,
  fetchProblemsForSession,
  fetchSessions,
} from '@/lib/api';

export function SessionDetailRoute() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [problems, setProblems] = useState<Awaited<ReturnType<typeof fetchProblemsForSession>>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sessionData, setSessionData] = useState<{
    id: string;
    title: string;
    isLive: boolean;
    problemCount: number;
    sendCount: number;
    flashCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const sessions = await fetchSessions();
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (session) {
        setSessionData({
          id: session.id,
          title: session.startTs.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }),
          isLive: !session.endTs,
          problemCount: session.problemCount,
          sendCount: session.sendCount,
          flashCount: session.flashCount,
        });
      }
      setProblems(await fetchProblemsForSession(sessionId));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo capture failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleEnd = async () => {
    if (!sessionId) return;
    await endSession(sessionId);
    void load();
  };

  if (!sessionId) return null;

  return (
    <div className="app-shell session-film-shell">
      <header className="top-bar film-top-bar">
        <Button variant="ghost" onClick={() => navigate('/')}>
          Back
        </Button>
        <div className="top-actions">
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Masking…' : 'Log a climb'}
          </Button>
          {sessionData?.isLive && (
            <Button variant="secondary" onClick={handleEnd}>
              End
            </Button>
          )}
        </div>
      </header>

      <section className="session-hero">
        <p className="eyebrow">Active Session</p>
        <h1>{sessionData?.title ?? 'Session'}</h1>
        <p>
          {sessionData?.problemCount ?? 0} climbs · {sessionData?.flashCount ?? 0} flash ·{' '}
          {sessionData?.sendCount ?? 0} sent
        </p>
      </section>

      {error && <Badge label={error} variant="warning" />}

      {loading ? (
        <div className="grid two">
          <Skeleton variant="image" />
          <Skeleton variant="image" />
        </div>
      ) : problems.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="empty-film-card tall"
        >
          <span>Camera opens first. Outcome comes after the mask.</span>
          <strong>Log a climb</strong>
        </button>
      ) : (
        <div className="film-grid">
          {problems.map((problem) => (
            <button
              key={problem.problemId}
              type="button"
              onClick={() => navigate(`/problem/${problem.problemId}`)}
              className="film-frame"
            >
              <div className="film-image">
                {problem.imageUrl && <img src={problem.imageUrl} alt="Captured climb" />}
                {problem.maskUrl && <img src={problem.maskUrl} alt="" className="route-overlay" />}
              </div>
              <div className="film-caption">
                <strong>
                  {problem.outcome
                    ? problem.outcome === 'send'
                      ? 'Sent'
                      : problem.outcome[0].toUpperCase() + problem.outcome.slice(1)
                    : 'Choose outcome'}
                </strong>
                <small>{problem.gradeLabel ?? 'Details tucked away'}</small>
              </div>
            </button>
          ))}
        </div>
      )}

      <FAB onClick={() => fileRef.current?.click()} aria-busy={uploading} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  );
}
