import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FAB } from '@/components/FAB';
import { Skeleton } from '@/components/Skeleton';
import { Badge, Button } from '@/components/ui';
import { createOrReuseActiveSession, createProblemFromUpload, fetchSessions } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';

export function SessionsRoute() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof fetchSessions>>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await fetchSessions());
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo capture failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSignOut = async () => {
    await getSupabaseClient().auth.signOut();
  };

  const activeSession = sessions.find((session) => !session.endTs) ?? null;
  const totalProblems = sessions.reduce((sum, session) => sum + session.problemCount, 0);

  return (
    <div className="app-shell session-film-shell">
      <header className="top-bar film-top-bar">
        <button
          type="button"
          className="brand-button"
          onClick={() => navigate('/')}
          aria-label="Crux home"
        >
          <span className="brand-mark">▲</span>
          <span>Crux</span>
        </button>
        <Button variant="ghost" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>

      <section className="hero-film">
        <p className="eyebrow">Session Film</p>
        <h1>One chalky hand. One send recorded.</h1>
        <p className="hero-copy">
          Log a climb, let Crux trace the route, then tap Flash, Sent, or Tried. No save screen. No
          dashboard.
        </p>
        <Button variant="primary" onClick={handleCapture} disabled={uploading}>
          {uploading ? 'Masking route…' : activeSession ? 'Log a climb' : 'Start with a climb'}
        </Button>
        <div className="quiet-stats">
          <span>{activeSession ? 'Active session ready' : 'New session starts on capture'}</span>
          <span>{totalProblems} climbs logged</span>
        </div>
      </section>

      {error && <Badge label={error} variant="warning" />}

      <section className="section-stack" aria-labelledby="recent-sessions">
        <div className="section-heading">
          <h2 id="recent-sessions">Recent sessions</h2>
          <Button variant="secondary" onClick={handleCapture} disabled={uploading}>
            Log a climb
          </Button>
        </div>
        {loading ? (
          <div className="grid">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        ) : sessions.length === 0 ? (
          <button type="button" onClick={handleCapture} className="empty-film-card">
            <span>Open the camera and capture your first route.</span>
            <strong>Log a climb</strong>
          </button>
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => navigate(`/session/${session.id}`)}
                className="session-row"
              >
                <span>
                  <strong>
                    {session.startTs.toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </strong>
                  <small>
                    {session.endTs ? 'Finished' : 'Active'} · {session.problemCount} climbs ·{' '}
                    {session.flashCount} flash · {session.sendCount} sent
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        )}
      </section>

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
