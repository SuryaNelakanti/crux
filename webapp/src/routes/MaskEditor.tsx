import { type HSL, rgbToHsl } from '@crux/vision';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DoodleScribble } from '@/components/Doodle';
import { Button, Segmented } from '@/components/ui';
import { fetchProblemDetail, saveMaskVersion } from '@/lib/api';
import {
  buildRouteMaskForCluster,
  buildRouteMaskForHoldColor,
  detectHoldsFromPhoto,
  pickBestCluster,
} from '@/lib/holds';
import { applyBrushToMask, loadMaskPixelsFromUrl, maskTint } from '@/lib/mask';

type BrushSize = 'S' | 'M' | 'L';
type HoldDetection = Awaited<ReturnType<typeof detectHoldsFromPhoto>>;
type Point = { x: number; y: number };

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
  const [tool, setTool] = useState<'select' | 'edit' | 'pick-wall'>('select');
  const [wallColor, setWallColor] = useState<HSL | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isHoldingAlt, setIsHoldingAlt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [holdDetection, setHoldDetection] = useState<HoldDetection | null>(null);
  const [maskMeta, setMaskMeta] = useState<{
    method: 'auto' | 'seed-color' | 'manual-edit' | 'color-dominant';
    seedColor?: HSL;
    confidence?: number | null;
  }>({ method: 'manual-edit' });

  const getContainTransform = (containerWidth: number, containerHeight: number) => {
    if (!maskSize) {
      return {
        scale: 1,
        drawWidth: containerWidth,
        drawHeight: containerHeight,
        offsetX: 0,
        offsetY: 0,
      };
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
    const { scale, drawWidth, drawHeight, offsetX, offsetY } = getContainTransform(
      rect.width,
      rect.height
    );
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

  const isBoundaryPixel = (
    labels: Int32Array,
    width: number,
    height: number,
    x: number,
    y: number,
    holdId: number
  ) => {
    const idx = y * width + x;
    if (labels[idx] !== holdId) return false;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true;
    const left = labels[idx - 1];
    const right = labels[idx + 1];
    const up = labels[idx - width];
    const down = labels[idx + width];
    return left !== holdId || right !== holdId || up !== holdId || down !== holdId;
  };

  const simplifyPath = (points: Point[], minDistance = 1.1) => {
    if (points.length <= 3) return points;
    const simplified: Point[] = [points[0]];
    let last = points[0];
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      if (dx * dx + dy * dy >= minDistance * minDistance) {
        simplified.push(point);
        last = point;
      }
    }
    return simplified;
  };

  const smoothClosedPath = (points: Point[], iterations = 1) => {
    let path = points;
    for (let i = 0; i < iterations; i += 1) {
      if (path.length < 3) return path;
      const next: Point[] = [];
      for (let j = 0; j < path.length; j += 1) {
        const p0 = path[j];
        const p1 = path[(j + 1) % path.length];
        next.push({
          x: 0.75 * p0.x + 0.25 * p1.x,
          y: 0.75 * p0.y + 0.25 * p1.y,
        });
        next.push({
          x: 0.25 * p0.x + 0.75 * p1.x,
          y: 0.25 * p0.y + 0.75 * p1.y,
        });
      }
      path = next;
    }
    return path;
  };

  const traceHoldOutline = (
    detection: HoldDetection,
    holdId: number,
    bbox: { minX: number; minY: number; maxX: number; maxY: number }
  ): Point[] => {
    const { labels, width, height } = detection;
    let start: Point | null = null;
    for (let y = bbox.minY; y <= bbox.maxY; y += 1) {
      for (let x = bbox.minX; x <= bbox.maxX; x += 1) {
        if (isBoundaryPixel(labels, width, height, x, y, holdId)) {
          start = { x, y };
          break;
        }
      }
      if (start) break;
    }
    if (!start) return [];

    const directions = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
    ];

    const path: Point[] = [];
    const visited = new Set<string>();
    let current = start;
    let prevDir = 6;
    const maxSteps = Math.max(100, (bbox.maxX - bbox.minX + bbox.maxY - bbox.minY) * 12);

    for (let step = 0; step < maxSteps; step += 1) {
      const key = `${current.x},${current.y}`;
      if (visited.has(key) && step > 10) break;
      visited.add(key);
      path.push({ x: current.x + 0.5, y: current.y + 0.5 });

      let found = false;
      for (let i = 0; i < directions.length; i += 1) {
        const dirIndex = (prevDir + 1 + i) % directions.length;
        const dir = directions[dirIndex];
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (!isBoundaryPixel(labels, width, height, nx, ny, holdId)) continue;
        current = { x: nx, y: ny };
        prevDir = (dirIndex + 4) % directions.length;
        found = true;
        break;
      }
      if (!found) break;
      if (current.x === start.x && current.y === start.y && step > 10) break;
    }

    return smoothClosedPath(simplifyPath(path), 1);
  };

  const buildHoldOutlines = (detection: HoldDetection) => {
    const outlines = new Map<number, Point[]>();
    for (const hold of detection.holds) {
      const outline = traceHoldOutline(detection, hold.id, hold.bbox);
      if (outline.length > 2) {
        outlines.set(hold.id, outline);
      }
    }
    return outlines;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: Local helpers are recreated but derive only from holdDetection.
  const holdOutlines = useMemo(() => {
    if (!holdDetection) return new Map<number, Point[]>();
    return buildHoldOutlines(holdDetection);
  }, [holdDetection]);

  const drawHoldOutlines = (
    ctx: CanvasRenderingContext2D,
    detection: NonNullable<typeof holdDetection>,
    routeMask: Uint8Array | null
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const { scale, offsetX, offsetY } = getContainTransform(rect.width, rect.height);
    const selected = new Set<number>();
    if (routeMask) {
      for (let i = 0; i < routeMask.length; i += 1) {
        if (routeMask[i] !== 1) continue;
        const holdId = detection.labels[i];
        if (holdId >= 0) selected.add(holdId);
      }
    }

    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Draw ALL holds with white fill + black stroke ("vector doodle" style)
    for (const hold of detection.holds) {
      const isSelected = selected.has(hold.id);
      const outline = holdOutlines.get(hold.id);

      // Style: white fill, black stroke for all. Selected gets thicker stroke.
      ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.7)';
      ctx.strokeStyle = isSelected ? '#1a1a1a' : 'rgba(30, 30, 30, 0.6)';
      ctx.lineWidth = isSelected ? Math.max(2.5, 3.5 / scale) : Math.max(1.2, 2 / scale);

      if (outline && outline.length > 2) {
        ctx.beginPath();
        ctx.moveTo(outline[0].x, outline[0].y);
        for (let i = 1; i < outline.length; i += 1) {
          ctx.lineTo(outline[i].x, outline[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Fallback to rounded rect bounding box
        const { minX, minY, maxX, maxY } = hold.bbox;
        const bboxW = maxX - minX + 1;
        const bboxH = maxY - minY + 1;
        const padding = Math.max(2, Math.min(bboxW, bboxH) * 0.08);
        const x = minX - padding;
        const y = minY - padding;
        const w = bboxW + padding * 2;
        const h = bboxH + padding * 2;
        const r = Math.min(10, Math.min(w, h) * 0.25);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Overlay a route color for selected holds
      if (isSelected) {
        ctx.fillStyle = 'rgba(47, 191, 156, 0.35)';
        if (outline && outline.length > 2) {
          ctx.beginPath();
          ctx.moveTo(outline[0].x, outline[0].y);
          for (let i = 1; i < outline.length; i += 1) {
            ctx.lineTo(outline[i].x, outline[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
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

      const { drawWidth, drawHeight, offsetX, offsetY } = getContainTransform(
        rect.width,
        rect.height
      );
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: renderMaskOverlay reads the listed canvas state.
  useEffect(() => {
    renderMaskOverlay();
  }, [rgbaData, maskSize, holdDetection, maskData, tool]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resize only needs the latest rendered mask state.
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
    : tool === 'pick-wall'
      ? 'Click on the wall to sample its color.'
      : isEditing
        ? 'Brush to refine. Hold Alt to erase.'
        : 'Tap a hold to select the route. Tap empty wall to clear.';

  const buildHoldOverlay = (
    detection: NonNullable<typeof holdDetection>,
    routeMask: Uint8Array | null
  ) => {
    const { width, height } = detection;
    const overlay = new Uint8Array(width * height * 4);
    if (!routeMask) return overlay;
    for (let i = 0; i < routeMask.length; i += 1) {
      if (routeMask[i] !== 1) continue;
      const offset = i * 4;
      overlay[offset] = maskTint.r;
      overlay[offset + 1] = maskTint.g;
      overlay[offset + 2] = maskTint.b;
      overlay[offset + 3] = maskTint.a;
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: buildHoldOverlay is a pure local renderer.
  useEffect(() => {
    if (!holdDetection) return;
    const routeMask = maskData ?? new Uint8Array(holdDetection.width * holdDetection.height);
    if (!maskData) setMaskData(routeMask);
    setRgbaData(buildHoldOverlay(holdDetection, routeMask));
  }, [holdDetection, maskData, tool]);

  const handleSelectHold = async (clientX: number, clientY: number) => {
    if (!maskSize) return;
    let detection = holdDetection;
    if (!detection && photoUrl) {
      setIsRegenerating(true);
      try {
        detection = await detectHoldsFromPhoto({
          uri: photoUrl,
          maxWidth: maskSize.width,
          wallColor: wallColor ?? undefined,
        });
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

  const handlePickWall = async (clientX: number, clientY: number) => {
    if (!photoUrl || !maskSize) return;
    const point = mapPointerToMask(clientX, clientY);
    if (!point) return;

    // Sample pixel color from the photo
    // Create a temporary canvas to get pixel data
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = photoUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });
    const canvas = document.createElement('canvas');
    canvas.width = maskSize.width;
    canvas.height = maskSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, maskSize.width, maskSize.height);
    const imageData = ctx.getImageData(point.x, point.y, 1, 1);
    const [r, g, b] = imageData.data;

    // Convert RGB to HSL
    const hsl = rgbToHsl({ r, g, b });
    setWallColor(hsl);

    // Re-detect holds with the new wall color
    setIsRegenerating(true);
    setTool('select');
    try {
      const detection = await detectHoldsFromPhoto({
        uri: photoUrl,
        maxWidth: maskSize.width,
        wallColor: hsl, // Pass the newly sampled color directly
      });
      setHoldDetection(detection);
      // Clear mask since we have a new detection
      setMaskData(new Uint8Array(maskSize.width * maskSize.height));
    } finally {
      setIsRegenerating(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pick-wall') {
      void handlePickWall(e.clientX, e.clientY);
      return;
    }
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
      const detection = await detectHoldsFromPhoto({
        uri: photoUrl,
        maxWidth: maskSize.width,
        wallColor: wallColor ?? undefined,
      });
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
        seedColor: method === 'manual-edit' ? null : (maskMeta.seedColor ?? null),
        confidence: method === 'manual-edit' ? null : (maskMeta.confidence ?? null),
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
              { value: 'pick-wall', label: 'Pick Wall' },
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
        {photoUrl && <img src={photoUrl} alt="Problem" className="mask-photo" />}
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
