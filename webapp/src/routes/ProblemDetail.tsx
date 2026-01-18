import { OUTCOME_OPTIONS, type Outcome } from '@crux/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DoodleArrow, DoodleWave, Sparkle } from '@/components/Doodle';
import { Badge, Button, Card, Input, Segmented, Textarea } from '@/components/ui';
import { fetchProblemDetail, getMaskConfidenceLabel, saveProblemLog } from '@/lib/api';

const MASK_VIEW_OPTIONS = [
  { value: 'photo', label: 'Photo' },
  { value: 'mask', label: 'Mask' },
] as const;

export function ProblemDetailRoute() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchProblemDetail>> | null>(null);
  const [maskView, setMaskView] = useState<'photo' | 'mask'>('photo');
  const [outcome, setOutcome] = useState<Outcome>('tried');
  const [attempts, setAttempts] = useState('');
  const [gradeMin, setGradeMin] = useState('');
  const [gradeMax, setGradeMax] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!problemId) return;
      const data = await fetchProblemDetail(problemId);
      setDetail(data);
      if (data?.log) {
        setOutcome(data.log.outcome);
        setAttempts(data.log.attemptsCount?.toString() ?? '');
        setGradeMin(data.log.gradeMin?.toString() ?? '');
        setGradeMax(data.log.gradeMax?.toString() ?? '');
        setNote(data.log.note ?? '');
      }
      setMaskView(data?.maskUrl ? 'mask' : 'photo');
    };
    void load();
  }, [problemId]);

  const handleSave = async () => {
    if (!problemId || !detail?.sessionId) return;
    setSaving(true);
    try {
      await saveProblemLog({
        problemId,
        sessionId: detail.sessionId,
        outcome,
        attemptsCount: attempts ? Number(attempts) : null,
        gradeMin: gradeMin ? Number(gradeMin) : null,
        gradeMax: gradeMax ? Number(gradeMax) : null,
        note: note.trim() === '' ? null : note.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!detail) {
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
            <div className="brand-title">Problem</div>
            <p className="brand-subtitle">{detail.sessionId ?? 'Session'}</p>
          </div>
        </div>
        <div className="nav-actions">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
          <DoodleWave />
        </div>
      </header>

      <section className="detail-grid">
        <Card className="reveal">
          <div className="photo-frame" style={{ height: 360 }}>
            {detail.imageUrl ? <img src={detail.imageUrl} alt="Problem" /> : null}
            {maskView === 'mask' && detail.maskUrl ? (
              <img className="mask-overlay" src={detail.maskUrl} alt="Mask overlay" />
            ) : null}
          </div>
          <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Badge
              label={`Mask: ${getMaskConfidenceLabel(detail.maskConfidence)}`}
              variant="brand"
            />
            {detail.maskMethod ? (
              <Badge label={`Method: ${detail.maskMethod}`} variant="neutral" />
            ) : null}
            {detail.maskUrl ? (
              <Badge label="Mask ready" variant="brand" />
            ) : (
              <Badge label="Mask pending" variant="warning" />
            )}
          </div>
          <div style={{ marginTop: '16px' }}>
            <Segmented options={[...MASK_VIEW_OPTIONS]} value={maskView} onChange={setMaskView} />
          </div>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <Button variant="secondary" onClick={() => navigate(`/problem/${problemId}/mask`)}>
              Edit mask
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Back to session
            </Button>
          </div>
        </Card>

        <Card className="reveal">
          <div className="section-kicker">Outcome</div>
          <h2 className="section-title">Log the climb</h2>
          <p className="muted">Keep it light. Tap an outcome, add attempts if you want, move on.</p>
          <Segmented
            options={OUTCOME_OPTIONS.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            value={outcome}
            onChange={setOutcome}
          />
          <div className="grid two" style={{ marginTop: '16px' }}>
            <div>
              <label className="muted" htmlFor="attempts-input">
                Attempts
              </label>
              <Input
                id="attempts-input"
                type="number"
                placeholder="e.g. 3"
                value={attempts}
                onChange={(event) => setAttempts(event.target.value)}
              />
            </div>
            <div>
              <div className="muted">Grade range</div>
              <div className="grid" style={{ gap: '8px' }}>
                <div>
                  <label className="muted" htmlFor="grade-min-input">
                    Min
                  </label>
                  <Input
                    id="grade-min-input"
                    type="number"
                    placeholder="Min"
                    value={gradeMin}
                    onChange={(event) => setGradeMin(event.target.value)}
                  />
                </div>
                <div>
                  <label className="muted" htmlFor="grade-max-input">
                    Max
                  </label>
                  <Input
                    id="grade-max-input"
                    type="number"
                    placeholder="Max"
                    value={gradeMax}
                    onChange={(event) => setGradeMax(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '16px' }}>
            <label className="muted" htmlFor="note-input">
              Note
            </label>
            <Textarea
              id="note-input"
              placeholder="Optional note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save log'}
            </Button>
            <Badge label="One tap flow" variant="brand" />
          </div>
          <div style={{ marginTop: '16px' }}>
            <DoodleArrow />
          </div>
        </Card>
      </section>
    </div>
  );
}
