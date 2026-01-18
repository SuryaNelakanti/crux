import { type Outcome } from '@crux/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/Skeleton';
import {
  Button,
  GradeSelector,
  Input,
  OutcomeChips,
  Segmented,
  Textarea,
  Toast,
} from '@/components/ui';
import { fetchProblemDetail, saveProblemLog, saveMaskVersion } from '@/lib/api';
import { readImagePixels } from '@/lib/image';
import {
  applyBrushToMask,
  buildMaskRgba,
  generateMaskFromPhoto,
  loadMaskPixelsFromUrl,
  maskTint,
} from '@/lib/mask';

export function ProblemDetailRoute() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchProblemDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'photo' | 'mask'>('photo');
  const [editingMask, setEditingMask] = useState(false);

  const [outcome, setOutcome] = useState<Outcome>('tried');
  const [grade, setGrade] = useState<number | null>(null);
  const [attempts, setAttempts] = useState('');
  const [note, setNote] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('Saved');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [maskData, setMaskData] = useState<Uint8Array | null>(null);
  const [rgbaData, setRgbaData] = useState<Uint8Array | null>(null);
  const [maskSize, setMaskSize] = useState<{ width: number; height: number } | null>(null);
  const [brushMode, setBrushMode] = useState<'add' | 'erase'>('add');
  const [brushSize, setBrushSize] = useState<'S' | 'M' | 'L'>('M');
  const [isDrawing, setIsDrawing] = useState(false);
  const [savingMask, setSavingMask] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!problemId) return;
    setLoading(true);
    try {
      const data = await fetchProblemDetail(problemId);
      setDetail(data);
      if (data?.log) {
        setOutcome(data.log.outcome);
        setGrade(data.log.gradeMin ?? data.log.gradeMax ?? null);
        setAttempts(data.log.attemptsCount?.toString() ?? '');
        setNote(data.log.note ?? '');
      }
      setView(data?.maskUrl ? 'mask' : 'photo');

      if (data?.maskUrl) {
        const loaded = await loadMaskPixelsFromUrl(data.maskUrl);
        setMaskData(loaded.mask);
        setRgbaData(loaded.rgba);
        setMaskSize({ width: loaded.width, height: loaded.height });
      } else if (data?.media.width && data?.media.height) {
        setMaskData(new Uint8Array(data.media.width * data.media.height));
        setRgbaData(new Uint8Array(data.media.width * data.media.height * 4));
        setMaskSize({ width: data.media.width, height: data.media.height });
      }
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  useEffect(() => {
    if (!canvasRef.current || !rgbaData || !maskSize || !editingMask) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    canvasRef.current.width = maskSize.width;
    canvasRef.current.height = maskSize.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgbaData), maskSize.width, maskSize.height), 0, 0);
  }, [rgbaData, maskSize, editingMask]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1500);
  };

  const saveLog = async () => {
    if (!problemId || !detail?.sessionId) return;
    await saveProblemLog({
      problemId,
      sessionId: detail.sessionId,
      outcome,
      attemptsCount: attempts ? Number(attempts) : null,
      gradeMin: grade,
      gradeMax: grade,
      note: note.trim() || null,
    });
    showToast('Saved ✓');
  };

  useEffect(() => {
    if (!detail) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveLog(), 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [outcome, grade, attempts, note]);

  const getRadius = () => {
    if (!maskSize) return 12;
    const base = Math.max(6, Math.round(maskSize.width * 0.015));
    return brushSize === 'S' ? base : brushSize === 'L' ? base * 2.5 : base * 1.6;
  };

  const paintAt = (x: number, y: number) => {
    if (!canvasRef.current || !maskData || !rgbaData || !maskSize) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = Math.round(((x - rect.left) / rect.width) * maskSize.width);
    const py = Math.round(((y - rect.top) / rect.height) * maskSize.height);
    applyBrushToMask({ mask: maskData, rgba: rgbaData, width: maskSize.width, height: maskSize.height, x: px, y: py, radius: getRadius(), mode: brushMode, tint: maskTint });
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(rgbaData), maskSize.width, maskSize.height), 0, 0);
  };

  const handleAutoMask = async () => {
    if (!detail?.imageUrl || !maskSize) return;
    const result = await generateMaskFromPhoto({ uri: detail.imageUrl, maxWidth: maskSize.width });
    setMaskData(result.mask);
    setRgbaData(buildMaskRgba(result.mask, result.width, result.height));
    setMaskSize({ width: result.width, height: result.height });
  };

  const handleSaveMask = async () => {
    if (!problemId || !maskData || !maskSize || savingMask) return;
    setSavingMask(true);
    try {
      await saveMaskVersion({ problemId, sessionId: detail?.sessionId ?? null, mask: maskData, width: maskSize.width, height: maskSize.height, method: 'manual-edit', seedColor: null, confidence: null });
      showToast('Mask saved');
      setEditingMask(false);
      void loadDetail();
    } finally {
      setSavingMask(false);
    }
  };

  if (loading) return <div className="app-shell"><Skeleton variant="image" /><Skeleton variant="card" /></div>;
  if (!detail) return null;

  return (
    <div className="app-shell" style={{ gap: 'var(--space-5)' }}>
      {/* Header */}
      <header className="top-bar">
        <Button variant="ghost" onClick={() => navigate(detail.sessionId ? `/session/${detail.sessionId}` : '/')}>←</Button>
        <Segmented
          options={[{ value: 'photo', label: 'Photo' }, { value: 'mask', label: 'Mask' }]}
          value={view}
          onChange={setView}
        />
      </header>

      {/* Full-width image */}
      <div style={{ position: 'relative', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        {detail.imageUrl && (
          <img src={detail.imageUrl} alt="Problem" style={{ width: '100%', display: 'block' }} />
        )}
        {view === 'mask' && detail.maskUrl && !editingMask && (
          <img src={detail.maskUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.7 }} />
        )}
        {editingMask && (
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: brushMode === 'add' ? 'crosshair' : 'cell' }}
            onPointerDown={(e) => { setIsDrawing(true); paintAt(e.clientX, e.clientY); }}
            onPointerMove={(e) => isDrawing && paintAt(e.clientX, e.clientY)}
            onPointerUp={() => setIsDrawing(false)}
            onPointerLeave={() => setIsDrawing(false)}
          />
        )}
      </div>

      {/* Mask tools */}
      {editingMask ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant={brushMode === 'add' ? 'primary' : 'secondary'} onClick={() => setBrushMode('add')}>+</Button>
            <Button variant={brushMode === 'erase' ? 'primary' : 'secondary'} onClick={() => setBrushMode('erase')}>−</Button>
            {(['S', 'M', 'L'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setBrushSize(s)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: brushSize === s ? 'var(--accent-primary)' : 'var(--surface-bright)', color: brushSize === s ? 'white' : 'var(--text-muted)', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>{s}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="ghost" onClick={() => void handleAutoMask()}>Auto</Button>
            <Button variant="ghost" onClick={() => setEditingMask(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void handleSaveMask()} disabled={savingMask}>{savingMask ? '...' : 'Save'}</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignSelf: 'flex-start' }}>
          <Button
            variant="primary"
            onClick={() => problemId && navigate(`/problem/${problemId}/mask`)}
          >
            Mask editor
          </Button>
          <Button variant="secondary" onClick={() => setEditingMask(true)}>
            Quick edit
          </Button>
        </div>
      )}

      {/* Outcome */}
      <div>
        <div className="text-sm muted" style={{ marginBottom: 'var(--space-2)' }}>Outcome</div>
        <OutcomeChips value={outcome} onChange={setOutcome} />
      </div>

      {/* Grade */}
      <div>
        <div className="text-sm muted" style={{ marginBottom: 'var(--space-2)' }}>Grade</div>
        <GradeSelector value={grade} onChange={setGrade} />
      </div>

      {/* Attempts & Notes inline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-4)' }}>
        <div>
          <label className="text-sm muted">Attempts</label>
          <Input type="number" placeholder="#" value={attempts} onChange={(e) => setAttempts(e.target.value)} style={{ marginTop: 'var(--space-2)' }} />
        </div>
        <div>
          <label className="text-sm muted">Notes</label>
          <Textarea placeholder="Beta, conditions..." rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 'var(--space-2)' }} />
        </div>
      </div>

      <Toast message={toastMessage} visible={toastVisible} />
    </div>
  );
}
