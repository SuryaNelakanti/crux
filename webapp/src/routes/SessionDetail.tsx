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
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const sessions = await fetchSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        setSessionData({
          id: session.id,
          title: session.startTs.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
          isLive: !session.endTs,
          problemCount: session.problemCount,
          sendCount: session.sendCount,
        });
      }
      const data = await fetchProblemsForSession(sessionId);
      setProblems(data);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCapture = () => fileRef.current?.click();

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
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
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
    <div className="app-shell">
      {/* Header */}
      <header className="top-bar">
        <Button variant="ghost" onClick={() => navigate('/')}>← INDEX</Button>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="primary" className="desktop-capture-btn" onClick={handleCapture} disabled={uploading}>
            {uploading ? 'PROCESSING...' : '+ ADD_DATA'}
          </Button>
          {sessionData?.isLive && (
            <Button variant="secondary" onClick={handleEnd}>TERMINATE</Button>
          )}
        </div>
      </header>

      {/* Session Manifesto */}
      <div style={{ borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-4)' }}>
        <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          REF: {sessionData?.id.slice(0, 8).toUpperCase()}
        </div>
        <h1 style={{ fontSize: '2rem', margin: 'var(--space-2) 0' }}>
          {sessionData?.title ?? 'Session Log'}
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <div className="mono" style={{ fontSize: '0.8rem' }}>
            COUNT: {sessionData?.problemCount}
          </div>
          <div className="mono" style={{ fontSize: '0.8rem' }}>
            COMPLETED: {sessionData?.sendCount}
          </div>
        </div>
      </div>

      {error && <Badge label={error} variant="warning" />}

      {/* Problems Grid - Image based */}
      {loading ? (
        <div className="grid two">
          <Skeleton variant="image" />
          <Skeleton variant="image" />
        </div>
      ) : problems.length === 0 ? (
        <button
          type="button"
          onClick={handleCapture}
          style={{
            width: '100%',
            aspectRatio: '4/3',
            background: 'var(--bg-secondary)',
            border: '2px dashed var(--border-strong)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span className="serif" style={{ fontSize: '1.5rem' }}>Empty Field</span>
          <span className="mono">NO_DATA_AVAILABLE</span>
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
          {problems.map((problem, i) => (
            <button
              key={problem.problemId}
              type="button"
              onClick={() => navigate(`/problem/${problem.problemId}`)}
              className="reveal"
              style={{
                animationDelay: `${i * 40}ms`,
                padding: 0,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                overflow: 'hidden',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative'
              }}
            >
              {/* Image */}
              <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1' }}>
                {problem.imageUrl && (
                  <img
                    src={problem.imageUrl}
                    alt="Problem"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(10%) contrast(110%)' }}
                  />
                )}

                {/* Technical Overlay */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(255,255,255,0.1)',
                  pointerEvents: 'none'
                }}>
                  {/* Crosshair */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: '10px', height: '10px',
                    border: '1px solid rgba(255,255,255,0.5)',
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%'
                  }} />
                </div>

                {/* Outcome Badge */}
                {problem.outcome && (
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    background: problem.outcome === 'send' || problem.outcome === 'flash' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                    color: problem.outcome === 'send' || problem.outcome === 'flash' ? 'white' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6rem',
                    padding: '2px 6px',
                    borderBottomRightRadius: '2px'
                  }}>
                    {problem.outcome.toUpperCase()}
                  </div>
                )}
              </div>

              {/* Meta */}
              <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                <div className="mono" style={{ fontSize: '0.7rem' }}>
                  GRADE: {problem.gradeLabel ?? 'N/A'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <FAB onClick={handleCapture} aria-busy={uploading} />

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
