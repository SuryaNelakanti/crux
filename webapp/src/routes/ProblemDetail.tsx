import { AUTO_MASK_CONFIDENCE_THRESHOLD, type Outcome } from '@crux/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/Skeleton';
import { Button, GradeSelector, Input, OutcomeChips, Textarea, Toast } from '@/components/ui';
import { fetchProblemDetail, saveProblemLog } from '@/lib/api';

export function ProblemDetailRoute() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchProblemDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingOutcome, setSavingOutcome] = useState<Outcome | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [grade, setGrade] = useState<number | null>(null);
  const [attempts, setAttempts] = useState('');
  const [note, setNote] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDetail = useCallback(async () => {
    if (!problemId) return;
    setLoading(true);
    try {
      const data = await fetchProblemDetail(problemId);
      setDetail(data);
      if (data?.log) {
        setGrade(data.log.gradeMin ?? data.log.gradeMax ?? null);
        setAttempts(data.log.attemptsCount?.toString() ?? '');
        setNote(data.log.note ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const showSaved = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 1400);
  };

  const saveOutcome = async (outcome: Outcome, returnToSession = true) => {
    if (!problemId || !detail?.sessionId || savingOutcome) return;
    setSavingOutcome(outcome);
    try {
      await saveProblemLog({
        problemId,
        sessionId: detail.sessionId,
        outcome,
        attemptsCount: attempts ? Number(attempts) : null,
        gradeMin: grade,
        gradeMax: grade,
        note: note.trim() || null,
      });
      showSaved();
      if (returnToSession) navigate(`/session/${detail.sessionId}`);
    } finally {
      setSavingOutcome(null);
    }
  };

  if (loading)
    return (
      <div className="app-shell">
        <Skeleton variant="image" />
        <Skeleton variant="card" />
      </div>
    );
  if (!detail) return null;

  const needsFix =
    detail.maskConfidence !== null && detail.maskConfidence < AUTO_MASK_CONFIDENCE_THRESHOLD;
  const currentOutcome = detail.log?.outcome ?? null;

  return (
    <div className="app-shell problem-save-shell">
      <header className="top-bar film-top-bar">
        <Button
          variant="ghost"
          onClick={() => navigate(detail.sessionId ? `/session/${detail.sessionId}` : '/')}
        >
          Back
        </Button>
        {(needsFix || showMore) && (
          <Button
            variant="secondary"
            onClick={() => problemId && navigate(`/problem/${problemId}/mask`)}
          >
            Fix route
          </Button>
        )}
      </header>

      <section className="capture-stage" aria-label="Captured climb with route mask">
        {detail.imageUrl && (
          <img src={detail.imageUrl} alt="Captured climb" className="capture-photo" />
        )}
        {detail.maskUrl && (
          <img src={detail.maskUrl} alt="Detected route mask" className="capture-mask" />
        )}
        <div className="capture-copy">
          <p className="eyebrow">Route traced</p>
          <h1>How did it go?</h1>
          <p>
            {needsFix
              ? 'The mask may need a quick touch-up.'
              : 'Tap once and get back to the wall.'}
          </p>
        </div>
      </section>

      <section className="outcome-panel" aria-label="Save outcome">
        <OutcomeChips value={currentOutcome} onChange={(next) => void saveOutcome(next)} />
        {savingOutcome && (
          <p className="saving-line">Saving {savingOutcome === 'send' ? 'sent' : savingOutcome}…</p>
        )}
      </section>

      {needsFix && !showMore && (
        <Button
          variant="secondary"
          onClick={() => problemId && navigate(`/problem/${problemId}/mask`)}
        >
          Fix route
        </Button>
      )}

      <button
        type="button"
        className="disclosure"
        onClick={() => setShowMore((open) => !open)}
        aria-expanded={showMore}
      >
        {showMore ? 'Hide details' : 'Add attempts, grade, note, or share'}
      </button>

      {showMore && (
        <section className="progressive-panel">
          <div>
            <div className="text-sm muted">Grade</div>
            <GradeSelector value={grade} onChange={setGrade} />
          </div>
          <div className="detail-grid">
            <label htmlFor="attempts-input">Attempts</label>
            <Input
              id="attempts-input"
              type="number"
              placeholder="Optional"
              value={attempts}
              onChange={(event) => setAttempts(event.target.value)}
            />
            <label htmlFor="notes-input">Notes</label>
            <Textarea
              id="notes-input"
              placeholder="Optional note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {currentOutcome && (
            <Button variant="primary" onClick={() => void saveOutcome(currentOutcome, false)}>
              Update details
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => problemId && navigate(`/problem/${problemId}/mask`)}
          >
            Fix route
          </Button>
        </section>
      )}

      <Toast message="Saved" visible={toastVisible} />
    </div>
  );
}
