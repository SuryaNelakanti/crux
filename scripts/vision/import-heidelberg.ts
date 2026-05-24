import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  getRouteLabel,
  groupHoldsByColor,
  type HSL,
  type Polygon,
  parseViaAnnotations,
  rasterizePolygons,
  rgbToHsl,
} from '../../packages/vision/src';

type Args = {
  source: string;
  out: string;
};

type ManifestHold = {
  id: number;
  polygon: Polygon;
  routeId: string;
  routeLabel: string;
  color: HSL;
  area: number;
};

type ManifestRoute = {
  id: string;
  label: string;
  holdIds: number[];
  color: HSL;
  maskPath: string;
};

type ManifestEntry = {
  id: string;
  imagePath: string;
  width: number;
  height: number;
  allHoldMaskPath: string;
  holds: ManifestHold[];
  routes: ManifestRoute[];
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseArgs(argv: string[]): Args {
  const args: Args = {
    source: '.data/raw/heidelberg',
    out: '.data/vision/heidelberg',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--source' && argv[i + 1]) {
      args.source = argv[i + 1];
      i += 1;
    } else if (value === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return {
    source: path.resolve(args.source),
    out: path.resolve(args.out),
  };
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listFiles(fullPath);
      return [fullPath];
    })
  );
  return files.flat();
}

function makeId(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveImagePath(
  filename: string,
  imageByRelative: Map<string, string>,
  imageByBasename: Map<string, string | null>
): string | null {
  const relative = path.normalize(filename).replace(/\\/g, '/');
  const direct = imageByRelative.get(relative);
  if (direct) return direct;
  return imageByBasename.get(path.basename(filename)) ?? null;
}

function maskToPng(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    out[i] = mask[i] ? 255 : 0;
  }
  return out;
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) count += 1;
  }
  return count;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function medianColorForMask(pixels: Uint8ClampedArray, mask: Uint8Array): HSL {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const offset = i * 4;
    r.push(pixels[offset]);
    g.push(pixels[offset + 1]);
    b.push(pixels[offset + 2]);
  }
  return rgbToHsl({
    r: median(r),
    g: median(g),
    b: median(b),
  });
}

function averageColor(colors: HSL[], holdIds: number[], holds: ManifestHold[]): HSL {
  let sumSin = 0;
  let sumCos = 0;
  let sumS = 0;
  let sumL = 0;
  let total = 0;
  for (const id of holdIds) {
    const hold = holds[id];
    const color = colors[id] ?? hold.color;
    const weight = Math.max(1, hold.area);
    const rad = (color.h * Math.PI) / 180;
    sumSin += Math.sin(rad) * weight;
    sumCos += Math.cos(rad) * weight;
    sumS += color.s * weight;
    sumL += color.l * weight;
    total += weight;
  }
  let h = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  if (h < 0) h += 360;
  return {
    h: Math.round(h),
    s: Math.round(sumS / Math.max(1, total)),
    l: Math.round(sumL / Math.max(1, total)),
  };
}

async function writeMask(maskPath: string, mask: Uint8Array, width: number, height: number) {
  await mkdir(path.dirname(maskPath), { recursive: true });
  await sharp(maskToPng(mask), { raw: { width, height, channels: 1 } })
    .png()
    .toFile(maskPath);
}

function clampPolygonToImage(polygon: Polygon, width: number, height: number): Polygon {
  const maxX = Math.max(0, width - 1);
  const maxY = Math.max(0, height - 1);
  return polygon.map((point) => ({
    x: Math.min(maxX, Math.max(0, point.x)),
    y: Math.min(maxY, Math.max(0, point.y)),
  }));
}

function parseAnnotationJson(raw: string): unknown {
  // The Kaggle Heidelberg annotations contain bare NaN values in some metadata fields.
  // Normalize those non-standard JSON tokens before parsing; geometry fields remain intact.
  return JSON.parse(raw.replace(/\b(?:NaN|Infinity|-Infinity)\b/g, 'null')) as unknown;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const files = await listFiles(args.source);
  const imageFiles = files.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const imageByRelative = new Map(
    imageFiles.map((file) => [path.relative(args.source, file).replace(/\\/g, '/'), file])
  );
  const imageByBasename = new Map<string, string | null>();
  for (const file of imageFiles) {
    const basename = path.basename(file);
    imageByBasename.set(basename, imageByBasename.has(basename) ? null : file);
  }
  const annotationFiles = files.filter((file) => /-annotation\.json$/i.test(path.basename(file)));

  const annotations = new Map<string, ReturnType<typeof parseViaAnnotations>[number]>();
  for (const file of annotationFiles) {
    const datasetName = path.basename(file).replace(/-annotation\.json$/i, '');
    const raw = parseAnnotationJson(await readFile(file, 'utf-8'));
    for (const annotation of parseViaAnnotations(raw)) {
      const filename = /[/\\]/.test(annotation.filename)
        ? annotation.filename.replace(/\\/g, '/')
        : path.join(datasetName, annotation.filename).replace(/\\/g, '/');
      annotations.set(filename, { ...annotation, filename });
    }
  }

  const manifest: ManifestEntry[] = [];
  const masksDir = path.join(args.out, 'masks');
  await mkdir(args.out, { recursive: true });

  for (const annotation of annotations.values()) {
    const imagePath = resolveImagePath(annotation.filename, imageByRelative, imageByBasename);
    if (!imagePath || annotation.regions.length === 0) continue;

    const { data, info } = await sharp(imagePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width ?? 0;
    const height = info.height ?? 0;
    if (!width || !height) continue;

    const pixels = new Uint8ClampedArray(data);
    const imageId = makeId(path.relative(args.source, imagePath));
    const holds: ManifestHold[] = [];
    const holdMasks: Uint8Array[] = [];

    for (const region of annotation.regions) {
      const polygon = clampPolygonToImage(region.polygon, width, height);
      const mask = rasterizePolygons(width, height, [polygon]);
      const area = countMask(mask);
      if (area === 0) continue;
      const label = getRouteLabel(region.attributes);
      const color = medianColorForMask(pixels, mask);
      const holdId = holds.length;
      holdMasks.push(mask);
      holds.push({
        id: holdId,
        polygon,
        routeId: label ?? '',
        routeLabel: label ?? '',
        color,
        area,
      });
    }

    if (holds.length === 0) continue;

    const labelGroups = new Map<string, number[]>();
    for (const hold of holds) {
      if (!hold.routeLabel) continue;
      const holdIds = labelGroups.get(hold.routeLabel) ?? [];
      holdIds.push(hold.id);
      labelGroups.set(hold.routeLabel, holdIds);
    }

    if (labelGroups.size === 0) {
      const inferred = groupHoldsByColor(
        holds.map((hold) => ({
          id: hold.id,
          avgColor: hold.color,
          area: hold.area,
          score: 1,
        }))
      );
      for (const group of inferred) {
        labelGroups.set(`inferred-${group.id}`, group.holdIds);
      }
    }

    const allHoldMask = new Uint8Array(width * height);
    for (const mask of holdMasks) {
      for (let i = 0; i < allHoldMask.length; i += 1) {
        if (mask[i]) allHoldMask[i] = 1;
      }
    }

    const allHoldMaskPath = path.join(masksDir, `${imageId}-holds.png`);
    await writeMask(allHoldMaskPath, allHoldMask, width, height);

    const routes: ManifestRoute[] = [];
    for (const [routeLabel, holdIds] of labelGroups.entries()) {
      const routeMask = new Uint8Array(width * height);
      for (const holdId of holdIds) {
        const mask = holdMasks[holdId];
        if (!mask) continue;
        for (let i = 0; i < routeMask.length; i += 1) {
          if (mask[i]) routeMask[i] = 1;
        }
      }
      const routeId = makeId(`${imageId}-${routeLabel}`);
      const maskPath = path.join(masksDir, `${routeId}.png`);
      await writeMask(maskPath, routeMask, width, height);
      for (const holdId of holdIds) {
        holds[holdId].routeId = routeId;
        holds[holdId].routeLabel = routeLabel;
      }
      routes.push({
        id: routeId,
        label: routeLabel,
        holdIds,
        color: averageColor(
          holds.map((hold) => hold.color),
          holdIds,
          holds
        ),
        maskPath: path.relative(args.out, maskPath),
      });
    }

    manifest.push({
      id: imageId,
      imagePath,
      width,
      height,
      allHoldMaskPath: path.relative(args.out, allHoldMaskPath),
      holds,
      routes,
    });
  }

  await writeFile(
    path.join(args.out, 'manifest.jsonl'),
    `${manifest.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf-8'
  );
  await writeFile(
    path.join(args.out, 'summary.json'),
    JSON.stringify(
      {
        images: manifest.length,
        holds: manifest.reduce((sum, item) => sum + item.holds.length, 0),
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`Imported ${manifest.length} annotated images into ${args.out}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
