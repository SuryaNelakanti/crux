import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, StatChip } from '@/components/ui';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { createSession, fetchSessions } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';

export function SessionsRoute() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof fetchSessions>>>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchSessions();
      setSessions(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleStart = async () => {
    const sessionId = await createSession();
    navigate(`/session/${sessionId}`);
  };

  const handleSignOut = async () => {
    const client = getSupabaseClient();
    await client.auth.signOut();
  };

  return (
    <div className="app-shell">
      <div className="header">
        <div className="brand">
          <Sparkle />
          <div>
            <h1>Crux</h1>
            <p>Photo-first bouldering journal</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
          <DoodleWave />
        </div>
      </div>

      <Card className="reveal">
        <div className="grid" style={{ gap: '16px' }}>
          <div>
            <h2 className="section-title">Start a session</h2>
            <p className="muted">
              Capture problems fast. Auto-mask the holds. Log in a few taps.
            </p>
          </div>
          <div className="footer-actions">
            <Button variant="primary" onClick={handleStart}>
              Start Session
            </Button>
            <Badge label="Auto mask" variant="brand" />
            <Badge label="Offline-friendly" variant="neutral" />
          </div>
        </div>
      </Card>

      <div>
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
          <div className="grid two">
            {sessions.map((session) => (
              <Card key={session.id} className="reveal">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {session.startTs.toLocaleDateString()}
                    </div>
                    <div className="muted" style={{ fontSize: '13px' }}>
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
    </div>
  );
}
