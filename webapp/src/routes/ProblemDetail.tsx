import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Input, Segmented, Textarea } from '@/components/ui';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { fetchProblemDetail, getMaskConfidenceLabel, saveProblemLog } from '@/lib/api';
import { OUTCOME_OPTIONS, type Outcome } from '@crux/shared';

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
      <div className="header">
        <div className="brand">
          <Sparkle />
          <div>
            <h1>Problem</h1>
            <p className="muted">{detail.sessionId ?? 'Session'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
          <DoodleWave />
        </div>
      </div>

      <Card className="reveal">
        <div className="photo-frame" style={{ height: 320 }}>
          {detail.imageUrl ? <img src={detail.imageUrl} alt="Problem" /> : null}
          {maskView === 'mask' && detail.maskUrl ? (
            <img className="mask-overlay" src={detail.maskUrl} alt="Mask overlay" />
          ) : null}
        </div>
        <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Badge label={`Mask: ${getMaskConfidenceLabel(detail.maskConfidence)}`} variant="brand" />
          {detail.maskMethod ? <Badge label={`Method: ${detail.maskMethod}`} variant="neutral" /> : null}
          {detail.maskUrl ? <Badge label="Mask ready" variant="brand" /> : <Badge label="Mask pending" variant="warning" />}
        </div>
        <div style={{ marginTop: '16px' }}>
          <Segmented options={[...MASK_VIEW_OPTIONS]} value={maskView} onChange={setMaskView} />
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => navigate(`/problem/${problemId}/mask`)}>
            Edit mask
          </Button>
        </div>
      </Card>

      <Card className="reveal">
        <h2 className="section-title">Log outcome</h2>
        <Segmented
          options={OUTCOME_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
          value={outcome}
          onChange={setOutcome}
        />
        <div className="grid two" style={{ marginTop: '16px' }}>
          <div>
            <label className="muted">Attempts</label>
            <Input
              type="number"
              placeholder="e.g. 3"
              value={attempts}
              onChange={(event) => setAttempts(event.target.value)}
            />
          </div>
          <div>
            <label className="muted">Grade range</label>
            <div className="grid" style={{ gap: '8px' }}>
              <Input
                type="number"
                placeholder="Min"
                value={gradeMin}
                onChange={(event) => setGradeMin(event.target.value)}
              />
              <Input
                type="number"
                placeholder="Max"
                value={gradeMax}
                onChange={(event) => setGradeMax(event.target.value)}
              />
            </div>
          </div>
        </div>
        <div style={{ marginTop: '16px' }}>
          <label className="muted">Note</label>
          <Textarea
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
        </div>
      </Card>
    </div>
  );
}
