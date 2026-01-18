import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FAB } from '@/components/FAB';
import { Skeleton } from '@/components/Skeleton';
import { Badge, Button } from '@/components/ui';
import { createProblemFromUpload, createSession, fetchSessions } from '@/lib/api';
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
      const data = await fetchSessions();
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCapture = () => {
    fileRef.current?.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const sessionId = await createSession();
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

  const handleSignOut = async () => {
    const client = getSupabaseClient();
    await client.auth.signOut();
  };

  const totalProblems = sessions.reduce((sum, s) => sum + s.problemCount, 0);

  return (
    <div className="app-shell">
      {/* Header - Atlas Style */}
      <header className="top-bar">
        <div className="top-bar-brand">
          <div className="brand-mark">▲</div> {/* Atlas-like Triangle symbol */}
          <span className="serif" style={{ fontSize: '1.25rem' }}>Crux Journal</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={handleSignOut}>
            LOG_OUT
          </Button>
        </div>
      </header>

      {/* Technical Status Block */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1px',
        background: 'var(--border-default)',
        border: '1px solid var(--border-default)',
        marginBottom: 'var(--space-4)'
      }}>
        <div style={{ background: 'var(--bg-primary)', padding: 'var(--space-4)' }}>
          <div className="mono" style={{ color: 'var(--text-muted)' }}>TOTAL_ENTRIES</div>
          <div className="serif" style={{ fontSize: '2rem' }}>{totalProblems}</div>
        </div>
        <div style={{ background: 'var(--bg-primary)', padding: 'var(--space-4)' }}>
          <div className="mono" style={{ color: 'var(--text-muted)' }}>ACTIVE_SESSIONS</div>
          <div className="serif" style={{ fontSize: '2rem' }}>{sessions.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="mono" style={{ fontSize: '0.8rem' }}>// RECENT_LOGS</h2>
        <Button variant="primary" onClick={handleCapture} disabled={uploading}>
          {uploading ? 'UPLOADING...' : '+ NEW_ENTRY'}
        </Button>
      </div>

      {error && <Badge label={error} variant="warning" />}

      {/* Sessions List */}
      {loading ? (
        <div className="grid">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : sessions.length === 0 ? (
        <button
          type="button"
          onClick={handleCapture}
          style={{
            width: '100%',
            padding: 'var(--space-8)',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border-strong)',
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          <div className="serif" style={{ fontSize: '1.5rem', marginBottom: 'var(--space-2)' }}>No Data Found</div>
          <div className="mono">INITIATE_FIRST_CAPTURE_SEQUENCE</div>
        </button>
      ) : (
        <div className="grid">
          {sessions.map((session, i) => (
            <button
              key={session.id}
              type="button"
              onClick={() => navigate(`/session/${session.id}`)}
              className="card reveal"
              style={{
                animationDelay: `${i * 100}ms`,
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                cursor: 'pointer',
                width: '100%',
                alignItems: 'center'
              }}
            >
              <div>
                <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  ID: {session.id.split('-')[0].toUpperCase()}
                </div>
                <div className="serif" style={{ fontSize: '1.25rem' }}>
                  {session.startTs.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <span className="mono" style={{ fontSize: '0.75rem' }}>PROBS: {session.problemCount}</span>
                  <span className="mono" style={{ fontSize: '0.75rem' }}>SENDS: {session.sendCount}</span>
                </div>
              </div>

              <div style={{
                width: '32px', height: '32px',
                border: '1px solid var(--border-strong)',
                display: 'grid', placeItems: 'center',
                color: 'var(--text-secondary)'
              }}>
                →
              </div>
            </button>
          ))}
        </div>
      )}

      {/* FAB - Adjusted for tech feel */}
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
