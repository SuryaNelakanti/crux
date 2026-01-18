import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoodleArrow, DoodleWave, Sparkle } from '@/components/Doodle';
import { Badge, Button, Card, StatChip } from '@/components/ui';
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

  const handleStart = async () => {
    const sessionId = await createSession();
    navigate(`/session/${sessionId}`);
  };

  const handleQuickCapture = () => {
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

  const latestSession = sessions[0] ?? null;
  const liveCount = sessions.filter((session) => !session.endTs).length;

  return (
    <div className="app-shell">
      <header className="nav">
        <div className="brand">
          <div className="brand-mark">
            <Sparkle />
          </div>
          <div>
            <div className="brand-title">Crux</div>
            <p className="brand-subtitle">Photo-first bouldering journal</p>
          </div>
        </div>
        <div className="nav-actions">
          <Button variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
          <DoodleWave />
        </div>
      </header>

      <section className="hero-grid">
        <Card className="reveal">
          <div className="section-kicker">Today</div>
          <h2 className="section-title">Start a live session</h2>
          <p className="muted">Capture problems fast. Auto-mask the holds. Log in a few taps.</p>
          <div className="footer-actions">
            <Button variant="primary" onClick={handleStart}>
              Start Session
            </Button>
            <Button variant="secondary" onClick={handleQuickCapture} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Quick capture'}
            </Button>
            <Badge label={`${liveCount} live`} variant="brand" />
          </div>
          {error ? <Badge label={error} variant="warning" /> : null}
          <div style={{ marginTop: '14px' }}>
            <DoodleArrow />
          </div>
        </Card>

        <Card className="card-ink reveal">
          <div className="section-kicker">Pulse</div>
          <h2 className="section-title">Recent energy</h2>
          {latestSession ? (
            <div className="grid" style={{ gap: '12px' }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 600 }}>
                  {latestSession.startTs.toLocaleDateString()}
                </div>
                <div style={{ color: 'rgba(248, 250, 252, 0.7)', fontSize: '13px' }}>
                  {latestSession.endTs ? 'Ended' : 'Live'} session
                </div>
              </div>
              <div className="pill-group">
                <StatChip label="Problems" value={latestSession.problemCount} />
                <StatChip label="Sends" value={latestSession.sendCount} />
                <StatChip label="Flashes" value={latestSession.flashCount} />
              </div>
              <Badge label="Auto mask + brush edits" variant="brand" />
            </div>
          ) : (
            <p style={{ color: 'rgba(248, 250, 252, 0.7)' }}>
              Your session pulse will show here once you log a climb.
            </p>
          )}
        </Card>
      </section>

      <div>
        <div className="section-kicker">Archive</div>
        <h2 className="section-title">Recent sessions</h2>
        {loading ? (
          <Card className="card-soft">
            <p className="muted">Loading sessions...</p>
          </Card>
        ) : sessions.length === 0 ? (
          <Card className="card-soft">
            <p className="muted">No sessions yet. Start your first climb.</p>
          </Card>
        ) : (
          <div className="gallery">
            {sessions.map((session) => (
              <Card key={session.id} className="reveal">
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <div className="problem-title">{session.startTs.toLocaleDateString()}</div>
                    <div className="problem-subtitle">
                      {session.endTs ? 'Ended' : 'Live'} session
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => navigate(`/session/${session.id}`)}>
                    Open
                  </Button>
                </div>
                <div className="pill-group" style={{ marginTop: '12px' }}>
                  <StatChip label="Problems" value={session.problemCount} />
                  <StatChip label="Sends" value={session.sendCount} />
                  <StatChip label="Flashes" value={session.flashCount} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  );
}
