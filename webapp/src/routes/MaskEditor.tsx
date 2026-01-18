import { type HSL } from '@crux/vision';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DoodleScribble } from '@/components/Doodle';
import { Button, Segmented } from '@/components/ui';
import { fetchProblemDetail, saveMaskVersion } from '@/lib/api';
import {
  applyBrushToMask,
  loadMaskPixelsFromUrl,
  maskTint,
} from '@/lib/mask';
import {
  buildRouteMaskForCluster,
  buildRouteMaskForHoldColor,
  detectHoldsFromPhoto,
  pickBestCluster,
} from '@/lib/holds';

type BrushSize = 'S' | 'M' | 'L';

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
  const [brushSize, setBrushSize] = useState<BrushSize>('M');
  const [tool, setTool] = useState<'select' | 'edit'>('select');
  const [saving, setSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isHoldingAlt, setIsHoldingAlt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [holdDetection, setHoldDetection] =
    useState<Awaited<ReturnType<typeof detectHoldsFromPhoto>> | null>(null);
  const [maskMeta, setMaskMeta] = useState<{
    method: 'auto' | 'seed-color' | 'manual-edit' | 'color-dominant';
    seedColor?: HSL;
    confidence?: number | null;
  }>({ method: 'manual-edit' });

  const getContainTransform = (containerWidth: number, containerHeight: number) => {
    if (!maskSize) {
      return { scale: 1, drawWidth: containerWidth, drawHeight: containerHeight, offsetX: 0, offsetY: 0 };
    }
    const scale = Math.min(containerWidth / maskSize.width, containerHeight / maskSize.height);
    const drawWidth = maskSize.width * scale;
    const drawHeight = maskSize.height * scale;
    const offsetX = (drawWidth - containerWidth) / 2;
    const offsetY = (drawHeight - containerHeight) / 2;
    return { scale, drawWidth, drawHeight, offsetX, offsetY };
  };

  const mapPointerToMask = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !maskSize) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const { scale, drawWidth, drawHeight, offsetX, offsetY } = getContainTransform(rect.width, rect.height);
    const imageLeft = rect.left - offsetX;
    const imageTop = rect.top - offsetY;
    if (
      clientX < imageLeft ||
      clientX > imageLeft + drawWidth ||
      clientY < imageTop ||
      clientY > imageTop + drawHeight
    ) {
      return null;
    }
    const x = (clientX - rect.left + offsetX) / scale;
    const y = (clientY - rect.top + offsetY) / scale;
    return {
      x: Math.min(maskSize.width - 1, Math.max(0, Math.round(x))),
      y: Math.min(maskSize.height - 1, Math.max(0, Math.round(y))),
    };
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  };

  const drawHoldOutlines = (
    ctx: CanvasRenderingContext2D,
    detection: NonNullable<typeof holdDetection>,
    routeMask: Uint8Array | null
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const { scale, drawWidth, drawHeight, offsetX, offsetY } = getContainTransform(rect.width, rect.height);
    const selected = new Set<number>();
    if (routeMask) {
      for (let i = 0; i < routeMask.length; i += 1) {
        if (routeMask[i] !== 1) continue;
        const holdId = detection.labels[i];
        if (holdId >= 0) selected.add(holdId);
      }
    }
    const hasSelection = selected.size > 0;
    const showAll = tool === 'edit' || !hasSelection;

    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.4, 2.4 / scale);

    for (const hold of detection.holds) {
      const isSelected = selected.has(hold.id);
      if (!showAll && !isSelected) continue;
      const { minX, minY, maxX, maxY } = hold.bbox;
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const padding = Math.max(2, Math.min(width, height) * 0.08);
      const x = minX - padding;
      const y = minY - padding;
      const w = width + padding * 2;
      const h = height + padding * 2;
      const radius = Math.min(10, Math.min(w, h) * 0.25);
      ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.98)' : 'rgba(47, 191, 156, 0.45)';
      drawRoundedRect(ctx, x, y, w, h, radius);
      ctx.stroke();
    }
    ctx.restore();
  };

  const renderMaskOverlay = () => {
    if (!canvasRef.current || !maskSize) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const canvas = canvasRef.current;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (tool === 'edit' && rgbaData) {
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

      const { drawWidth, drawHeight, offsetX, offsetY } = getContainTransform(rect.width, rect.height);
      ctx.drawImage(offscreen, -offsetX, -offsetY, drawWidth, drawHeight);
    }
    if (holdDetection) {
      drawHoldOutlines(ctx, holdDetection, maskData);
    }
  };

  // Load problem data
  useEffect(() => {
    const load = async () => {
      if (!problemId) return;
      const detail = await fetchProblemDetail(problemId);
      if (!detail) return;
      setSessionId(detail.sessionId);
      setPhotoUrl(detail.imageUrl);
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
        if (detail.imageUrl) {
          const detection = await detectHoldsFromPhoto({
            uri: detail.imageUrl,
            maxWidth: loaded.width,
          });
          setHoldDetection(detection);
        }
      } else if (detail.imageUrl) {
        const img = await loadImageDimensions(detail.imageUrl);
        const targetWidth = Math.min(img.width, 1200);
        const scale = targetWidth / img.width;
        const targetHeight = Math.round(img.height * scale);
        const detection = await detectHoldsFromPhoto({
          uri: detail.imageUrl,
          maxWidth: targetWidth,
        });
        setHoldDetection(detection);
        setMaskData(new Uint8Array(detection.width * detection.height));
        setMaskSize({ width: detection.width, height: detection.height });
        if (img.width !== targetWidth || img.height !== targetHeight) {
          setMaskMeta({ method: 'manual-edit' });
        }
      }
    };
    void load();
  }, [problemId]);

  // Draw mask to canvas
  useEffect(() => {
    renderMaskOverlay();
  }, [rgbaData, maskSize, holdDetection, maskData, tool]);

  useEffect(() => {
    const handleResize = () => renderMaskOverlay();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rgbaData, maskSize]);

  // Hold-to-switch with pointer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'Control') setIsHoldingAlt(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'Control') setIsHoldingAlt(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getRadius = () => {
    if (!maskSize) return 12;
    const base = Math.max(6, Math.round(maskSize.width * 0.012));
    if (brushSize === 'S') return base;
    if (brushSize === 'L') return Math.round(base * 2.2);
    return Math.round(base * 1.5);
  };

  const activeMode = isHoldingAlt ? (mode === 'add' ? 'erase' : 'add') : mode;
  const isEditing = tool === 'edit';
  const hintText = isRegenerating
    ? 'Detecting holds...'
    : isEditing
      ? 'Brush to refine. Hold Alt to erase.'
      : 'Tap a hold to select the route. Tap empty wall to clear.';

  const buildHoldOverlay = (
    detection: NonNullable<typeof holdDetection>,
    routeMask: Uint8Array | null,
    options?: { showAllHolds?: boolean }
  ) => {
    const { labels, width, height } = detection;
    const overlay = new Uint8Array(width * height * 4);
    const holdTint = { r: 47, g: 191, b: 156 };
    const routeTint = { r: 255, g: 255, b: 255 };
    const holdAlpha = 80;
    const routeAlpha = 255;
    const routeHaloAlpha = 200;
    let routeHasPixels = false;
    if (routeMask) {
      for (let i = 0; i < routeMask.length; i += 1) {
        if (routeMask[i] === 1) {
          routeHasPixels = true;
          break;
        }
      }
    }
    const showAllHolds = options?.showAllHolds ?? !routeHasPixels;

    const setPixel = (
      idx: number,
      alpha: number,
      tint: { r: number; g: number; b: number }
    ) => {
      const offset = idx * 4;
      overlay[offset] = tint.r;
      overlay[offset + 1] = tint.g;
      overlay[offset + 2] = tint.b;
      overlay[offset + 3] = Math.max(overlay[offset + 3], alpha);
    };

    // Hold outlines (all holds)
    if (showAllHolds) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          const holdId = labels[idx];
          if (holdId < 0) continue;
          const left = x > 0 ? labels[idx - 1] : -1;
          const right = x < width - 1 ? labels[idx + 1] : -1;
          const up = y > 0 ? labels[idx - width] : -1;
          const down = y < height - 1 ? labels[idx + width] : -1;
          const isEdge = left !== holdId || right !== holdId || up !== holdId || down !== holdId;
          if (!isEdge) continue;
          setPixel(idx, holdAlpha, holdTint);
        }
      }
    }

    // Route outlines (mask edges, for manual edits and selection)
    if (routeMask) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (routeMask[idx] !== 1) continue;
          const left = x > 0 ? routeMask[idx - 1] : 0;
          const right = x < width - 1 ? routeMask[idx + 1] : 0;
          const up = y > 0 ? routeMask[idx - width] : 0;
          const down = y < height - 1 ? routeMask[idx + width] : 0;
          const isEdge = left === 0 || right === 0 || up === 0 || down === 0;
          if (!isEdge) continue;
          setPixel(idx, routeAlpha, routeTint);
          if (x > 0) setPixel(idx - 1, routeHaloAlpha, routeTint);
          if (x < width - 1) setPixel(idx + 1, routeHaloAlpha, routeTint);
          if (y > 0) setPixel(idx - width, routeHaloAlpha, routeTint);
          if (y < height - 1) setPixel(idx + width, routeHaloAlpha, routeTint);
        }
      }
    }

    return overlay;
  };

  const applyRouteMask = (
    detection: NonNullable<typeof holdDetection>,
    clusterIndex: number | null
  ) => {
    const routeMask = buildRouteMaskForCluster(detection, clusterIndex);
    setMaskData(routeMask);
    setRgbaData(buildHoldOverlay(detection, routeMask));
    if (clusterIndex !== null) {
      setMaskMeta({ method: 'auto', seedColor: undefined, confidence: null });
    }
  };

  const applyRouteMaskPixels = (
    detection: NonNullable<typeof holdDetection>,
    routeMask: Uint8Array
  ) => {
    setMaskData(routeMask);
    setRgbaData(buildHoldOverlay(detection, routeMask));
    setMaskMeta({ method: 'auto', seedColor: undefined, confidence: null });
  };

  useEffect(() => {
    if (!holdDetection) return;
    const routeMask =
      maskData ?? new Uint8Array(holdDetection.width * holdDetection.height);
    if (!maskData) setMaskData(routeMask);
    setRgbaData(buildHoldOverlay(holdDetection, routeMask));
  }, [holdDetection, maskData, tool]);

  const handleSelectHold = async (clientX: number, clientY: number) => {
    if (!maskSize) return;
    let detection = holdDetection;
    if (!detection && photoUrl) {
      setIsRegenerating(true);
      try {
        detection = await detectHoldsFromPhoto({ uri: photoUrl, maxWidth: maskSize.width });
        setHoldDetection(detection);
      } finally {
        setIsRegenerating(false);
      }
    }
    if (!detection) return;
    const point = mapPointerToMask(clientX, clientY);
    if (!point) {
      applyRouteMask(detection, null);
      return;
    }
    const idx = point.y * detection.width + point.x;
    const holdId = detection.labels[idx];
    if (holdId < 0) {
      applyRouteMask(detection, null);
      return;
    }
    const routeMask = buildRouteMaskForHoldColor(detection, holdId);
    applyRouteMaskPixels(detection, routeMask);
  };

  const paintAt = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !maskData || !maskSize) return;
    const point = mapPointerToMask(clientX, clientY);
    if (!point) return;
    applyBrushToMask({
      mask: maskData,
      rgba: rgbaData ?? new Uint8Array(maskSize.width * maskSize.height * 4),
      width: maskSize.width,
      height: maskSize.height,
      x: point.x,
      y: point.y,
      radius: getRadius(),
      mode: activeMode,
      tint: maskTint,
    });
    setMaskMeta((prev) => (prev.method === 'manual-edit' ? prev : { method: 'manual-edit' }));
    if (holdDetection) {
      setRgbaData(buildHoldOverlay(holdDetection, maskData));
    } else if (rgbaData) {
      renderMaskOverlay();
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'select') {
      void handleSelectHold(e.clientX, e.clientY);
      return;
    }
    setIsDrawing(true);
    paintAt(e.clientX, e.clientY);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    paintAt(e.clientX, e.clientY);
  };
  const handlePointerUp = () => setIsDrawing(false);

  const handleFitToScreen = () => {
    // Scroll to center canvas (simple fit)
    canvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAutoMask = async () => {
    if (!photoUrl || !maskSize) return;
    setIsRegenerating(true);
    try {
      const detection = await detectHoldsFromPhoto({ uri: photoUrl, maxWidth: maskSize.width });
      setHoldDetection(detection);
      applyRouteMask(detection, pickBestCluster(detection));
    } finally {
      setIsRegenerating(false);
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
    <div className="mask-editor">
      <header className="mask-header">
        <div className="mask-header-left">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
          <div className="mask-header-meta">
            <span className="mono" style={{ color: 'var(--text-muted)' }}>
              Mask editor
            </span>
            <span className="mask-header-title">Route mask</span>
          </div>
        </div>
        <div className="mask-header-center">
          <Segmented
            options={[
              { value: 'select', label: 'Select' },
              { value: 'edit', label: 'Edit' },
            ]}
            value={tool}
            onChange={setTool}
            label="Mask editor mode"
          />
          <span className="mask-header-hint">{hintText}</span>
        </div>
        <div className="mask-header-actions">
          <Button variant="ghost" onClick={() => void handleAutoMask()} disabled={isRegenerating}>
            {isRegenerating ? 'Auto route...' : 'Auto route'}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
        <div className="mask-header-doodle" aria-hidden="true">
          <DoodleScribble
            style={{
              color: 'var(--accent-primary)',
              opacity: 0.2,
            }}
          />
        </div>
      </header>

      <div className="mask-canvas">
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Problem"
            className="mask-photo"
          />
        )}
        <canvas
          ref={canvasRef}
          className="mask-overlay"
          style={{
            cursor: tool === 'select' ? 'crosshair' : activeMode === 'add' ? 'crosshair' : 'cell',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {isEditing && (
        <div className="mask-toolbar" role="toolbar" aria-label="Mask editing tools">
          <button
            type="button"
            onClick={() => setMode('add')}
            className={`mask-tool ${mode === 'add' ? 'active' : ''}`}
            aria-pressed={mode === 'add'}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setMode('erase')}
            className={`mask-tool erase ${mode === 'erase' ? 'active' : ''}`}
            aria-pressed={mode === 'erase'}
          >
            Erase
          </button>

          <div className="mask-toolbar-divider" />

          {(['S', 'M', 'L'] as BrushSize[]).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setBrushSize(size)}
              className={`mask-tool size ${brushSize === size ? 'active' : ''}`}
              aria-pressed={brushSize === size}
            >
              {size}
            </button>
          ))}

          <div className="mask-toolbar-divider" />

          <button type="button" onClick={handleFitToScreen} className="mask-tool">
            Center
          </button>
        </div>
      )}
    </div>
  );
}

async function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}


