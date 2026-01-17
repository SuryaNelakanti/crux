import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card } from '@/components/ui';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { createProblemFromUpload, fetchProblemsForSession, fetchSessions, endSession } from '@/lib/api';
import { ProblemCard } from '@/components/ProblemCard';

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

  const load = async () => {
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
  };

  useEffect(() => {
    void load();
  }, [sessionId]);

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
      <div className="header">
        <div className="brand">
          <Sparkle />
          <div>
            <h1>{sessionTitle}</h1>
            <p>{sessionStatus} session</p>
          </div>
        </div>
        <DoodleWave />
      </div>

      <Card className="reveal">
        <div className="grid" style={{ gap: '16px' }}>
          <div>
            <h2 className="section-title">Capture a problem</h2>
            <p className="muted">
              Upload a wall photo. We will auto-mask the dominant hold color.
            </p>
          </div>
          <div className="footer-actions">
            <Button variant="primary" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload photo'}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Back to sessions
            </Button>
            <Button variant="ghost" onClick={handleEnd}>
              End session
            </Button>
          </div>
          <div className="pill-group">
            <Badge label="Auto mask" variant="brand" />
            <Badge label="Brush edits" variant="neutral" />
          </div>
          {error ? <Badge label={error} variant="warning" /> : null}
        </div>
      </Card>

      <div>
        <h2 className="section-title">Problems</h2>
        {loading ? (
          <Card className="card-soft">
            <p className="muted">Loading problems...</p>
          </Card>
        ) : problems.length === 0 ? (
          <Card className="card-soft">
            <p className="muted">No problems captured yet.</p>
          </Card>
        ) : (
          <div className="grid two">
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
