import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DoodleArrow, DoodleWave, Sparkle } from '@/components/Doodle';
import { Badge, Button, Card, Segmented } from '@/components/ui';
import { fetchProblemDetail, saveMaskVersion } from '@/lib/api';
import { applyBrushToMask, loadMaskPixelsFromUrl, maskTint } from '@/lib/mask';

const MODE_OPTIONS = [
  { value: 'add', label: 'Add' },
  { value: 'erase', label: 'Erase' },
] as const;

const SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
] as const;

export function MaskEditorRoute() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [maskData, setMaskData] = useState<Uint8Array | null>(null);
  const [rgbaData, setRgbaData] = useState<Uint8Array | null>(null);
  const [maskSize, setMaskSize] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<'add' | 'erase'>('add');
  const [brushSize, setBrushSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [saving, setSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!problemId) return;
      const detail = await fetchProblemDetail(problemId);
      if (!detail) return;
      setSessionId(detail.sessionId);
      setPhotoUrl(detail.imageUrl);
      if (detail.maskUrl) {
        const loaded = await loadMaskPixelsFromUrl(detail.maskUrl);
        setMaskData(loaded.mask);
        setRgbaData(loaded.rgba);
        setMaskSize({ width: loaded.width, height: loaded.height });
      } else if (detail.imageUrl) {
        const loadImageSize = () =>
          new Promise<{ width: number; height: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () =>
              resolve({
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
              });
            img.onerror = () => reject(new Error('Unable to load image'));
            img.src = detail.imageUrl ?? '';
          });
        const { width, height } =
          detail.media.width && detail.media.height
            ? { width: detail.media.width, height: detail.media.height }
            : await loadImageSize();
        setMaskData(new Uint8Array(width * height));
        setRgbaData(new Uint8Array(width * height * 4));
        setMaskSize({ width, height });
      }
    };
    void load();
  }, [problemId]);

  useEffect(() => {
    if (!canvasRef.current || !rgbaData || !maskSize) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    canvasRef.current.width = maskSize.width;
    canvasRef.current.height = maskSize.height;
    const imageData = new ImageData(
      new Uint8ClampedArray(rgbaData),
      maskSize.width,
      maskSize.height
    );
    ctx.putImageData(imageData, 0, 0);
  }, [rgbaData, maskSize]);

  const getBrushRadius = () => {
    if (!maskSize) return 8;
    const base = Math.max(4, Math.round(maskSize.width * 0.01));
    if (brushSize === 'small') return base;
    if (brushSize === 'large') return Math.round(base * 2.2);
    return Math.round(base * 1.5);
  };

  const paintAt = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !maskData || !rgbaData || !maskSize) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round(((clientX - rect.left) / rect.width) * maskSize.width);
    const y = Math.round(((clientY - rect.top) / rect.height) * maskSize.height);
    applyBrushToMask({
      mask: maskData,
      rgba: rgbaData,
      width: maskSize.width,
      height: maskSize.height,
      x,
      y,
      radius: getBrushRadius(),
      mode,
      tint: maskTint,
    });
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const imageData = new ImageData(
      new Uint8ClampedArray(rgbaData),
      maskSize.width,
      maskSize.height
    );
    ctx.putImageData(imageData, 0, 0);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    paintAt(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    paintAt(event.clientX, event.clientY);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleSave = async () => {
    if (!problemId || !maskData || !maskSize || saving) return;
    setSaving(true);
    try {
      await saveMaskVersion({
        problemId,
        sessionId,
        mask: maskData,
        width: maskSize.width,
        height: maskSize.height,
      });
      navigate(`/problem/${problemId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="nav">
        <div className="brand">
          <div className="brand-mark">
            <Sparkle />
          </div>
          <div>
            <div className="brand-title">Mask editor</div>
            <p className="brand-subtitle">Brush add or erase holds</p>
          </div>
        </div>
        <div className="nav-actions">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
          <DoodleWave />
        </div>
      </header>

      <section className="editor-grid">
        <Card className="reveal">
          {!photoUrl || !maskSize ? (
            <p className="muted">Loading mask editor...</p>
          ) : (
            <>
              <div className="photo-frame" style={{ height: 360 }}>
                <img src={photoUrl} alt="Problem" />
                <canvas
                  ref={canvasRef}
                  className="mask-overlay"
                  style={{ width: '100%', height: '100%', touchAction: 'none' }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
              </div>
              <div className="footer-actions" style={{ marginTop: '16px' }}>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save mask'}
                </Button>
                <Badge label="Versioned edits" variant="brand" />
              </div>
            </>
          )}
        </Card>

        <div className="toolbelt">
          <Card className="card-soft reveal">
            <div className="section-kicker">Tools</div>
            <h2 className="section-title">Brush controls</h2>
            <div style={{ marginTop: '12px' }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: '6px' }}>
                Mode
              </div>
              <Segmented options={[...MODE_OPTIONS]} value={mode} onChange={setMode} />
            </div>
            <div style={{ marginTop: '16px' }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: '6px' }}>
                Brush size
              </div>
              <Segmented options={[...SIZE_OPTIONS]} value={brushSize} onChange={setBrushSize} />
            </div>
          </Card>

          <Card className="card-soft reveal">
            <div className="section-kicker">Tips</div>
            <h2 className="section-title">Keep it clean</h2>
            <p className="muted">
              Use a bigger brush for blocks, then tighten edges with a small pass.
            </p>
            <div style={{ marginTop: '12px' }}>
              <DoodleArrow />
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
