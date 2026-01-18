import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DoodleArrow, DoodleWave, Sparkle } from '@/components/Doodle';
import { ProblemCard } from '@/components/ProblemCard';
import { Badge, Button, Card } from '@/components/ui';
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
  const [sessionTitle, setSessionTitle] = useState<string>('Session');
  const [sessionStatus, setSessionStatus] = useState<'Live' | 'Ended'>('Live');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const sessions = await fetchSessions();
      const session = sessions.find((entry) => entry.id === sessionId);
      if (session) {
        setSessionTitle(session.startTs.toLocaleDateString());
        setSessionStatus(session.endTs ? 'Ended' : 'Live');
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

  const handleUpload = () => {
    fileRef.current?.click();
  };

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

  if (!sessionId) {
    return null;
  }

  return (
    <div className="app-shell">
      <header className="nav">
        <div className="brand">
          <div className="brand-mark">
            <Sparkle />
          </div>
          <div>
            <div className="brand-title">{sessionTitle}</div>
            <p className="brand-subtitle">{sessionStatus} session</p>
          </div>
        </div>
        <div className="nav-actions">
          <Button variant="secondary" onClick={() => navigate('/')}>
            Sessions
          </Button>
          <Button variant="ghost" onClick={handleEnd}>
            End session
          </Button>
          <DoodleWave />
        </div>
      </header>

      <section className="hero-grid">
        <Card className="reveal">
          <div className="section-kicker">Capture</div>
          <h2 className="section-title">Drop a wall photo</h2>
          <p className="muted">
            We auto-mask the dominant hold color and prep a clean route overlay.
          </p>
          <button type="button" className="dropzone" onClick={handleUpload} disabled={uploading}>
            <div style={{ fontWeight: 600 }}>
              {uploading ? 'Uploading...' : 'Click to upload a photo'}
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              JPG or PNG. Best results with the wall centered.
            </p>
          </button>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <Button variant="primary" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload photo'}
            </Button>
            <Badge label="Auto mask" variant="brand" />
            <Badge label="Brush edits" variant="neutral" />
          </div>
          {error ? <Badge label={error} variant="warning" /> : null}
        </Card>

        <Card className="card-soft reveal">
          <div className="section-kicker">Session status</div>
          <h2 className="section-title">Keep it flowing</h2>
          <p className="muted">Capture each problem as you move. Logs stay light and fast.</p>
          <div className="pill-group" style={{ marginTop: '12px' }}>
            <Badge label={sessionStatus === 'Live' ? 'Live capture' : 'Ended'} variant="brand" />
            <Badge label={`${problems.length} problems`} variant="neutral" />
          </div>
          <div style={{ marginTop: '16px' }}>
            <DoodleArrow />
          </div>
        </Card>
      </section>

      <section>
        <div className="section-kicker">Problems</div>
        <h2 className="section-title">Captured routes</h2>
        {loading ? (
          <Card className="card-soft">
            <p className="muted">Loading problems...</p>
          </Card>
        ) : problems.length === 0 ? (
          <Card className="card-soft">
            <p className="muted">No problems captured yet.</p>
          </Card>
        ) : (
          <div className="gallery">
            {problems.map((problem) => (
              <ProblemCard
                key={problem.problemId}
                title={problem.gradeLabel ?? 'Unrated'}
                subtitle={problem.outcome ? `Outcome: ${problem.outcome}` : 'Log your outcome'}
                imageUrl={problem.imageUrl}
                maskUrl={problem.maskUrl}
                outcome={problem.outcome}
                gradeLabel={problem.gradeLabel}
                onClick={() => navigate(`/problem/${problem.problemId}`)}
              />
            ))}
          </div>
        )}
      </section>

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
