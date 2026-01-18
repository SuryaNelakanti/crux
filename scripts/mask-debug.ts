import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { generateMask, rgbToHsl, type HSL } from '../packages/vision/src/index.ts';

type Args = {
  imagePath: string;
  outDir: string;
  seedX?: number;
  seedY?: number;
  seedNX?: number;
  seedNY?: number;
  seedWindow: number;
  maxWidth?: number;
};

const MASK_TINT = { r: 47, g: 191, b: 156, a: 235 };

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    imagePath: 'C:\\Users\\ASUS\\Downloads\\bouldering+volta.webp',
    outDir: path.resolve('scripts/output'),
    seedWindow: 4,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--image' && argv[i + 1]) {
      args.imagePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (value === '--out' && argv[i + 1]) {
      args.outDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (value === '--seed-x' && argv[i + 1]) {
      args.seedX = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (value === '--seed-y' && argv[i + 1]) {
      args.seedY = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (value === '--seed-nx' && argv[i + 1]) {
      args.seedNX = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (value === '--seed-ny' && argv[i + 1]) {
      args.seedNY = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (value === '--seed-window' && argv[i + 1]) {
      args.seedWindow = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (value === '--max-width' && argv[i + 1]) {
      args.maxWidth = Number(argv[i + 1]);
      i += 1;
    }
  }
  return args;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sampleSeedColor = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  seedWindow: number
): HSL => {
  const clampedX = clamp(Math.round(seedX), 0, width - 1);
  const clampedY = clamp(Math.round(seedY), 0, height - 1);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let dy = -seedWindow; dy <= seedWindow; dy += 1) {
    for (let dx = -seedWindow; dx <= seedWindow; dx += 1) {
      const x = clampedX + dx;
      const y = clampedY + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const offset = (y * width + x) * 4;
      sumR += pixels[offset];
      sumG += pixels[offset + 1];
      sumB += pixels[offset + 2];
      count += 1;
    }
  }

  return rgbToHsl({
    r: count ? Math.round(sumR / count) : pixels[(clampedY * width + clampedX) * 4],
    g: count
      ? Math.round(sumG / count)
      : pixels[(clampedY * width + clampedX) * 4 + 1],
    b: count
      ? Math.round(sumB / count)
      : pixels[(clampedY * width + clampedX) * 4 + 2],
  });
};

const buildMaskRgba = (mask: Uint8Array, width: number, height: number): Uint8Array => {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const offset = i * 4;
    rgba[offset] = MASK_TINT.r;
    rgba[offset + 1] = MASK_TINT.g;
    rgba[offset + 2] = MASK_TINT.b;
    rgba[offset + 3] = MASK_TINT.a;
  }
  return rgba;
};

const countMask = (mask: Uint8Array) => {
  let hits = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) hits += 1;
  }
  return hits;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const imagePath = path.resolve(args.imagePath);
  await mkdir(args.outDir, { recursive: true });

  const imagePipeline = sharp(imagePath);
  if (args.maxWidth) {
    imagePipeline.resize({ width: args.maxWidth });
  }
  const { data, info } = await imagePipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  const width = info.width ?? 0;
  const height = info.height ?? 0;

  let seedColor: HSL | undefined;
  const seedX =
    args.seedX !== undefined
      ? args.seedX
      : args.seedNX !== undefined
        ? Math.round(args.seedNX * width)
        : undefined;
  const seedY =
    args.seedY !== undefined
      ? args.seedY
      : args.seedNY !== undefined
        ? Math.round(args.seedNY * height)
        : undefined;
  if (seedX !== undefined && seedY !== undefined) {
    seedColor = sampleSeedColor(pixels, width, height, seedX, seedY, args.seedWindow);
  }

  const result = generateMask({
    pixels,
    width,
    height,
    seedColor,
    seedPoint: seedX !== undefined && seedY !== undefined ? { x: seedX, y: seedY } : undefined,
  });
  const hits = countMask(result.mask);
  const coverage = width * height ? hits / (width * height) : 0;

  const rgba = buildMaskRgba(result.mask, width, height);
  const maskPath = path.join(args.outDir, 'mask.png');
  const overlayPath = path.join(args.outDir, 'overlay.png');
  const reportPath = path.join(args.outDir, 'report.json');

  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(maskPath);

  await sharp(imagePath)
    .resize({ width, height })
    .ensureAlpha()
    .composite([{ input: rgba, raw: { width, height, channels: 4 } }])
    .png()
    .toFile(overlayPath);

  await writeFile(
    reportPath,
    JSON.stringify(
      {
        imagePath,
        width,
        height,
        method: result.method,
        confidence: result.confidence,
        seedColor: seedColor ?? null,
        selectedSeed: result.seedColor,
        coverage,
        clusters: result.clusters.map((cluster) => ({
          center: cluster.center,
          count: cluster.count,
          avgSaturation: cluster.avgSaturation,
          score: cluster.score,
        })),
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`Mask saved: ${maskPath}`);
  console.log(`Overlay saved: ${overlayPath}`);
  console.log(`Report saved: ${reportPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
