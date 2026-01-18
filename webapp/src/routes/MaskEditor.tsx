import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type HSL, rgbToHsl } from '@crux/vision';
import { DoodleArrow, DoodleWave, Sparkle } from '@/components/Doodle';
import { Badge, Button, Card, Segmented } from '@/components/ui';
import { fetchProblemDetail, saveMaskVersion } from '@/lib/api';
import { readImagePixels } from '@/lib/image';
import {
  applyBrushToMask,
  buildMaskRgba,
  generateMaskFromPhoto,
  loadMaskPixelsFromUrl,
  maskTint,
} from '@/lib/mask';

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
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [maskData, setMaskData] = useState<Uint8Array | null>(null);
  const [rgbaData, setRgbaData] = useState<Uint8Array | null>(null);
  const [maskSize, setMaskSize] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<'add' | 'erase'>('add');
  const [brushSize, setBrushSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [saving, setSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [photoSample, setPhotoSample] = useState<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
  } | null>(null);
  const [maskMeta, setMaskMeta] = useState<{
    method: 'auto' | 'seed-color' | 'manual-edit' | 'color-dominant';
    seedColor?: HSL;
    confidence?: number | null;
  }>({ method: 'manual-edit' });

  const getCoverTransform = (containerWidth: number, containerHeight: number) => {
    if (!maskSize) {
      return { scale: 1, drawWidth: containerWidth, drawHeight: containerHeight, offsetX: 0, offsetY: 0 };
    }
    const scale = Math.max(containerWidth / maskSize.width, containerHeight / maskSize.height);
    const drawWidth = maskSize.width * scale;
    const drawHeight = maskSize.height * scale;
    const offsetX = (drawWidth - containerWidth) / 2;
    const offsetY = (drawHeight - containerHeight) / 2;
    return { scale, drawWidth, drawHeight, offsetX, offsetY };
  };

  const mapPointerToMask = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !maskSize) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const { scale, offsetX, offsetY } = getCoverTransform(rect.width, rect.height);
    const x = (clientX - rect.left + offsetX) / scale;
    const y = (clientY - rect.top + offsetY) / scale;
    const clampedX = Math.min(maskSize.width - 1, Math.max(0, Math.round(x)));
    const clampedY = Math.min(maskSize.height - 1, Math.max(0, Math.round(y)));
    return { x: clampedX, y: clampedY };
  };

  const renderMaskOverlay = () => {
    if (!canvasRef.current || !rgbaData || !maskSize) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const offscreen = offscreenRef.current ?? document.createElement('canvas');
    offscreenRef.current = offscreen;
    if (offscreen.width !== maskSize.width || offscreen.height !== maskSize.height) {
      offscreen.width = maskSize.width;
      offscreen.height = maskSize.height;
    }
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;
    const imageData = new ImageData(
      new Uint8ClampedArray(rgbaData),
      maskSize.width,
      maskSize.height
    );
    offCtx.putImageData(imageData, 0, 0);

    const { drawWidth, drawHeight, offsetX, offsetY } = getCoverTransform(rect.width, rect.height);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(offscreen, -offsetX, -offsetY, drawWidth, drawHeight);
  };

  useEffect(() => {
    const load = async () => {
      if (!problemId) return;
      const detail = await fetchProblemDetail(problemId);
      if (!detail) return;
      setSessionId(detail.sessionId);
      setPhotoUrl(detail.imageUrl);
      setPhotoSample(null);
      if (
        detail.maskMethod === 'auto' ||
        detail.maskMethod === 'seed-color' ||
        detail.maskMethod === 'manual-edit' ||
        detail.maskMethod === 'color-dominant'
      ) {
        setMaskMeta({ method: detail.maskMethod, confidence: detail.maskConfidence });
      } else {
        setMaskMeta({ method: 'manual-edit' });
      }
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
    renderMaskOverlay();
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
    const point = mapPointerToMask(clientX, clientY);
    if (!point) return;
    applyBrushToMask({
      mask: maskData,
      rgba: rgbaData,
      width: maskSize.width,
      height: maskSize.height,
      x: point.x,
      y: point.y,
      radius: getBrushRadius(),
      mode,
      tint: maskTint,
    });
    setMaskMeta((prev) => (prev.method === 'manual-edit' ? prev : { method: 'manual-edit' }));
    renderMaskOverlay();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPickingColor) {
      void handlePickColor(event.clientX, event.clientY);
      return;
    }
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

  const ensurePhotoSample = async () => {
    if (!photoUrl || !maskSize) return null;
    if (photoSample) return photoSample;
    const sample = await readImagePixels({ uri: photoUrl, maxWidth: maskSize.width });
    setPhotoSample(sample);
    return sample;
  };

  const handlePickColor = async (clientX: number, clientY: number) => {
    if (!canvasRef.current || !photoUrl || !maskSize) return;
    setIsRegenerating(true);
    try {
      const sample = await ensurePhotoSample();
      if (!sample) return;
      const point = mapPointerToMask(clientX, clientY);
      if (!point) return;
      const scaleX = sample.width / maskSize.width;
      const scaleY = sample.height / maskSize.height;
      const clampedX = Math.min(sample.width - 1, Math.max(0, Math.round(point.x * scaleX)));
      const clampedY = Math.min(sample.height - 1, Math.max(0, Math.round(point.y * scaleY)));
      const offset = (clampedY * sample.width + clampedX) * 4;
      const seedWindow = 4;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let dy = -seedWindow; dy <= seedWindow; dy += 1) {
        for (let dx = -seedWindow; dx <= seedWindow; dx += 1) {
          const sx = clampedX + dx;
          const sy = clampedY + dy;
          if (sx < 0 || sy < 0 || sx >= sample.width || sy >= sample.height) continue;
          const sOffset = (sy * sample.width + sx) * 4;
          sumR += sample.pixels[sOffset];
          sumG += sample.pixels[sOffset + 1];
          sumB += sample.pixels[sOffset + 2];
          count += 1;
        }
      }
      const seedColor = rgbToHsl({
        r: count ? Math.round(sumR / count) : sample.pixels[offset],
        g: count ? Math.round(sumG / count) : sample.pixels[offset + 1],
        b: count ? Math.round(sumB / count) : sample.pixels[offset + 2],
      });

      const result = await generateMaskFromPhoto({
        uri: photoUrl,
        seedColor,
        maxWidth: sample.width,
      });
      const rgba = buildMaskRgba(result.mask, result.width, result.height);
      setMaskData(result.mask);
      setRgbaData(rgba);
      setMaskSize({ width: result.width, height: result.height });
      setMaskMeta({
        method: result.method,
        seedColor: result.seedColor,
        confidence: result.confidence,
      });
    } finally {
      setIsRegenerating(false);
      setIsPickingColor(false);
    }
  };

  const handleAutoMask = async () => {
    if (!photoUrl || !maskSize) return;
    setIsRegenerating(true);
    try {
      const sample = await ensurePhotoSample();
      const maxWidth = sample?.width ?? maskSize.width;
      const result = await generateMaskFromPhoto({ uri: photoUrl, maxWidth });
      const rgba = buildMaskRgba(result.mask, result.width, result.height);
      setMaskData(result.mask);
      setRgbaData(rgba);
      setMaskSize({ width: result.width, height: result.height });
      setMaskMeta({ method: result.method, seedColor: result.seedColor, confidence: result.confidence });
    } finally {
      setIsRegenerating(false);
      setIsPickingColor(false);
    }
  };

  const handleSave = async () => {
    if (!problemId || !maskData || !maskSize || saving) return;
    setSaving(true);
    try {
      const method = maskMeta.method ?? 'manual-edit';
      await saveMaskVersion({
        problemId,
        sessionId,
        mask: maskData,
        width: maskSize.width,
        height: maskSize.height,
        method,
        seedColor: method === 'manual-edit' ? null : maskMeta.seedColor ?? null,
        confidence: method === 'manual-edit' ? null : maskMeta.confidence ?? null,
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
                  style={{
                    width: '100%',
                    height: '100%',
                    touchAction: 'none',
                    cursor: isPickingColor ? 'crosshair' : 'default',
                  }}
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
            <div style={{ marginTop: '16px' }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: '6px' }}>
                Auto mask
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  variant={isPickingColor ? 'primary' : 'secondary'}
                  onClick={() => setIsPickingColor((value) => !value)}
                  disabled={isRegenerating}
                >
                  {isPickingColor ? 'Tap a hold…' : 'Pick hold color'}
                </Button>
                <Button variant="ghost" onClick={() => void handleAutoMask()} disabled={isRegenerating}>
                  {isRegenerating ? 'Rebuilding…' : 'Re-run auto'}
                </Button>
              </div>
              <div
                className="muted"
                style={{ fontSize: '12px', marginTop: '8px', display: 'flex', gap: '8px' }}
              >
                <span>
                  {maskMeta.method === 'seed-color'
                    ? 'Seeded mask'
                    : maskMeta.method === 'auto' || maskMeta.method === 'color-dominant'
                      ? 'Auto mask'
                      : 'Brush edits'}
                </span>
                {maskMeta.seedColor ? (
                  <span
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '999px',
                      background: `hsl(${maskMeta.seedColor.h}, ${maskMeta.seedColor.s}%, ${maskMeta.seedColor.l}%)`,
                      border: '1px solid var(--border)',
                    }}
                  />
                ) : null}
              </div>
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
