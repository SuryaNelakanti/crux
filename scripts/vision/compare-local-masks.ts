import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { calculateBinaryMaskMetrics } from '../../packages/vision/src';

type Args = {
  imagePath: string;
  modelCardPath: string;
  outDir: string;
  pythonPath: string;
  deterministicMaxWidth: number;
  modelMaxWidth: number;
  renderMaxWidth: number;
  seedX?: number;
  seedY?: number;
  imgsz: number;
  conf: number;
  iou: number;
  device?: string;
  tiled: boolean;
  tileSize: number;
  overlap: number;
  batch: number;
  half: boolean;
  maxDet: number;
  serialTiles: boolean;
  topGroups: number;
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    imagePath: '',
    modelCardPath: '.models/vision/crux-route-mask-model/model-card.json',
    outDir: 'scripts/output/vision-ml/local-mask-compare',
    pythonPath: '.venv-vision-ml/Scripts/python',
    deterministicMaxWidth: 1024,
    modelMaxWidth: 0,
    renderMaxWidth: 1024,
    imgsz: 640,
    conf: 0.05,
    iou: 0.75,
    tiled: true,
    tileSize: 1536,
    overlap: 256,
    batch: 1,
    half: false,
    maxDet: 300,
    serialTiles: true,
    topGroups: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    const next = argv[i + 1];
    if (value === '--image' && next) {
      args.imagePath = next;
      i += 1;
    } else if (value === '--model-card' && next) {
      args.modelCardPath = next;
      i += 1;
    } else if (value === '--out' && next) {
      args.outDir = next;
      i += 1;
    } else if (value === '--python' && next) {
      args.pythonPath = next;
      i += 1;
    } else if (value === '--deterministic-max-width' && next) {
      args.deterministicMaxWidth = Number(next);
      i += 1;
    } else if (value === '--model-max-width' && next) {
      args.modelMaxWidth = Number(next);
      i += 1;
    } else if (value === '--render-max-width' && next) {
      args.renderMaxWidth = Number(next);
      i += 1;
    } else if (value === '--seed-x' && next) {
      args.seedX = Number(next);
      i += 1;
    } else if (value === '--seed-y' && next) {
      args.seedY = Number(next);
      i += 1;
    } else if (value === '--imgsz' && next) {
      args.imgsz = Number(next);
      i += 1;
    } else if (value === '--conf' && next) {
      args.conf = Number(next);
      i += 1;
    } else if (value === '--iou' && next) {
      args.iou = Number(next);
      i += 1;
    } else if (value === '--device' && next) {
      args.device = next;
      i += 1;
    } else if (value === '--tile-size' && next) {
      args.tileSize = Number(next);
      i += 1;
    } else if (value === '--overlap' && next) {
      args.overlap = Number(next);
      i += 1;
    } else if (value === '--batch' && next) {
      args.batch = Number(next);
      i += 1;
    } else if (value === '--max-det' && next) {
      args.maxDet = Number(next);
      i += 1;
    } else if (value === '--top-groups' && next) {
      args.topGroups = Number(next);
      i += 1;
    } else if (value === '--full-frame') {
      args.tiled = false;
    } else if (value === '--tiled') {
      args.tiled = true;
    } else if (value === '--half') {
      args.half = true;
    } else if (value === '--serial-tiles') {
      args.serialTiles = true;
    } else if (value === '--parallel-tiles') {
      args.serialTiles = false;
    }
  }

  if (!args.imagePath) {
    throw new Error('Missing required --image path.');
  }
  return args;
};

const runCommand = (command: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}`));
    });
  });

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf-8')) as T;

const readMask = async (
  maskPath: string,
  width: number,
  height: number,
  channel: 'alpha' | 'luma'
): Promise<Uint8Array> => {
  const { data } = await sharp(maskPath)
    .resize({ width, height, fit: 'fill', kernel: 'nearest' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    const offset = i * 4;
    const value = channel === 'alpha' ? data[offset + 3] : data[offset];
    mask[i] = value > 0 ? 1 : 0;
  }
  return mask;
};

const writeTintOverlay = async (
  imagePath: string,
  mask: Uint8Array,
  width: number,
  height: number,
  color: { r: number; g: number; b: number; a: number },
  outPath: string
) => {
  const overlay = new Uint8Array(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const offset = i * 4;
    overlay[offset] = color.r;
    overlay[offset + 1] = color.g;
    overlay[offset + 2] = color.b;
    overlay[offset + 3] = color.a;
  }
  await sharp(imagePath)
    .resize({ width, height, fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: Buffer.from(overlay), raw: { width, height, channels: 4 } }])
    .png()
    .toFile(outPath);
};

const writeSideBySide = async (
  deterministicOverlay: string,
  modelOverlay: string,
  width: number,
  height: number,
  outPath: string
) => {
  await sharp({
    create: {
      width: width * 2,
      height,
      channels: 4,
      background: '#111111',
    },
  })
    .composite([
      {
        input: await sharp(deterministicOverlay).resize({ width, height }).png().toBuffer(),
        left: 0,
        top: 0,
      },
      {
        input: await sharp(modelOverlay).resize({ width, height }).png().toBuffer(),
        left: width,
        top: 0,
      },
    ])
    .png()
    .toFile(outPath);
};

const coverage = (mask: Uint8Array): number => {
  let count = 0;
  for (const value of mask) {
    if (value) count += 1;
  }
  return mask.length ? count / mask.length : 0;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const imagePath = path.resolve(args.imagePath);
  const outDir = path.resolve(args.outDir);
  const deterministicOut = path.join(outDir, 'deterministic');
  const modelOut = path.join(outDir, 'model-card');
  await mkdir(deterministicOut, { recursive: true });
  await mkdir(modelOut, { recursive: true });

  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`Unable to read image dimensions for ${imagePath}`);
  }

  const deterministicArgs = [
    path.resolve('node_modules/tsx/dist/cli.mjs'),
    'scripts/mask-debug.ts',
    '--image',
    imagePath,
    '--out',
    deterministicOut,
  ];
  deterministicArgs.push('--max-width', String(args.deterministicMaxWidth));
  if (args.deterministicMaxWidth !== undefined) {
    const scale = Math.min(1, args.deterministicMaxWidth / width);
    if (args.seedX !== undefined && args.seedY !== undefined) {
      deterministicArgs.push(
        '--seed-x',
        String(Math.round(args.seedX * scale)),
        '--seed-y',
        String(Math.round(args.seedY * scale))
      );
    }
  } else if (args.seedX !== undefined && args.seedY !== undefined) {
    deterministicArgs.push('--seed-x', String(args.seedX), '--seed-y', String(args.seedY));
  }
  await runCommand(process.execPath, deterministicArgs);

  const modelArgs = [
    'scripts/vision-ml/infer-yolo-route.py',
    '--model-card',
    path.resolve(args.modelCardPath),
    '--image',
    imagePath,
    '--out',
    modelOut,
    '--imgsz',
    String(args.imgsz),
    '--conf',
    String(args.conf),
    '--iou',
    String(args.iou),
    '--max-det',
    String(args.maxDet),
    '--top-groups',
    String(args.topGroups),
  ];
  if (args.modelMaxWidth > 0) {
    modelArgs.push('--source-max-width', String(args.modelMaxWidth));
  }
  if (args.device) modelArgs.push('--device', args.device);
  if (args.tiled) {
    modelArgs.push(
      '--tiled',
      '--tile-size',
      String(args.tileSize),
      '--overlap',
      String(args.overlap),
      '--batch',
      String(args.batch)
    );
  }
  if (args.half) modelArgs.push('--half');
  if (args.serialTiles) modelArgs.push('--serial-tiles');
  if (args.seedX !== undefined && args.seedY !== undefined) {
    modelArgs.push('--seed-x', String(args.seedX), '--seed-y', String(args.seedY));
  }
  await runCommand(path.resolve(args.pythonPath), modelArgs);

  const deterministicMaskPath = path.join(deterministicOut, 'route-mask.png');
  const deterministicAllHoldsMaskPath = path.join(deterministicOut, 'all-holds-mask.png');
  const modelMaskPath = path.join(modelOut, 'selected-route-mask.png');
  const modelAllHoldsMaskPath = path.join(modelOut, 'all-holds-mask.png');
  const deterministicMask = await readMask(deterministicMaskPath, width, height, 'alpha');
  const deterministicAllHoldsMask = await readMask(
    deterministicAllHoldsMaskPath,
    width,
    height,
    'alpha'
  );
  const modelMask = await readMask(modelMaskPath, width, height, 'luma');
  const modelAllHoldsMask = await readMask(modelAllHoldsMaskPath, width, height, 'luma');
  const selectedOverlapMetrics = calculateBinaryMaskMetrics(deterministicMask, modelMask);
  const allHoldsOverlapMetrics = calculateBinaryMaskMetrics(
    deterministicAllHoldsMask,
    modelAllHoldsMask
  );
  const deterministicCoverage = coverage(deterministicMask);
  const modelCoverage = coverage(modelMask);
  const deterministicAllHoldsCoverage = coverage(deterministicAllHoldsMask);
  const modelAllHoldsCoverage = coverage(modelAllHoldsMask);
  const renderScale = args.renderMaxWidth > 0 ? Math.min(1, args.renderMaxWidth / width) : 1;
  const renderWidth = Math.max(1, Math.round(width * renderScale));
  const renderHeight = Math.max(1, Math.round(height * renderScale));
  const deterministicMaskForRender = await readMask(
    deterministicMaskPath,
    renderWidth,
    renderHeight,
    'alpha'
  );
  const modelMaskForRender = await readMask(modelMaskPath, renderWidth, renderHeight, 'luma');
  const deterministicAllHoldsForRender = await readMask(
    deterministicAllHoldsMaskPath,
    renderWidth,
    renderHeight,
    'alpha'
  );
  const modelAllHoldsForRender = await readMask(
    modelAllHoldsMaskPath,
    renderWidth,
    renderHeight,
    'luma'
  );

  const deterministicOverlay = path.join(outDir, 'deterministic-selected-overlay.png');
  const modelOverlay = path.join(outDir, 'model-card-selected-overlay.png');
  const sideBySide = path.join(outDir, 'comparison-selected-overlays.png');
  const deterministicAllHoldsOverlay = path.join(outDir, 'deterministic-all-holds-overlay.png');
  const modelAllHoldsOverlay = path.join(outDir, 'model-card-all-holds-overlay.png');
  const allHoldsSideBySide = path.join(outDir, 'comparison-all-holds-overlays.png');
  await writeTintOverlay(
    imagePath,
    deterministicMaskForRender,
    renderWidth,
    renderHeight,
    { r: 47, g: 191, b: 156, a: 190 },
    deterministicOverlay
  );
  await writeTintOverlay(
    imagePath,
    modelMaskForRender,
    renderWidth,
    renderHeight,
    { r: 255, g: 51, b: 102, a: 150 },
    modelOverlay
  );
  await writeSideBySide(deterministicOverlay, modelOverlay, renderWidth, renderHeight, sideBySide);
  await writeTintOverlay(
    imagePath,
    deterministicAllHoldsForRender,
    renderWidth,
    renderHeight,
    { r: 255, g: 245, b: 210, a: 155 },
    deterministicAllHoldsOverlay
  );
  await writeTintOverlay(
    imagePath,
    modelAllHoldsForRender,
    renderWidth,
    renderHeight,
    { r: 0, g: 210, b: 255, a: 115 },
    modelAllHoldsOverlay
  );
  await writeSideBySide(
    deterministicAllHoldsOverlay,
    modelAllHoldsOverlay,
    renderWidth,
    renderHeight,
    allHoldsSideBySide
  );

  const deterministicReportPath = path.join(deterministicOut, 'report.json');
  const modelReportPath = path.join(modelOut, 'report.json');
  const deterministicReport = await readJson(deterministicReportPath);
  const modelReport = await readJson<{
    outputs?: { topGroups?: unknown[] };
  }>(modelReportPath);
  const report = {
    image: imagePath,
    generatedAt: new Date().toISOString(),
    localOnly: true,
    dimensions: { width, height },
    inputs: {
      modelCard: path.resolve(args.modelCardPath),
      deterministicMaxWidth: args.deterministicMaxWidth ?? null,
      modelMaxWidth: args.modelMaxWidth > 0 ? args.modelMaxWidth : null,
      renderMaxWidth: args.renderMaxWidth > 0 ? args.renderMaxWidth : null,
      seed:
        args.seedX !== undefined && args.seedY !== undefined
          ? { x: args.seedX, y: args.seedY }
          : null,
      modelInference: {
        imgsz: args.imgsz,
        conf: args.conf,
        iou: args.iou,
        tiled: args.tiled,
        tileSize: args.tiled ? args.tileSize : null,
        overlap: args.tiled ? args.overlap : null,
        batch: args.tiled ? args.batch : null,
        half: args.half,
        maxDet: args.maxDet,
        serialTiles: args.tiled ? args.serialTiles : null,
        topGroups: args.topGroups,
        device: args.device ?? null,
      },
    },
    outputs: {
      deterministicReport: deterministicReportPath,
      modelReport: modelReportPath,
      deterministicOverlay,
      modelOverlay,
      sideBySide,
      deterministicAllHoldsOverlay,
      modelAllHoldsOverlay,
      allHoldsSideBySide,
      topModelGroups: modelReport.outputs?.topGroups ?? [],
    },
    comparison: {
      selectedRoute: {
        deterministicCoverage,
        modelCoverage,
        coverageDelta: modelCoverage - deterministicCoverage,
        deterministicVsModel: selectedOverlapMetrics,
      },
      allHolds: {
        deterministicCoverage: deterministicAllHoldsCoverage,
        modelCoverage: modelAllHoldsCoverage,
        coverageDelta: modelAllHoldsCoverage - deterministicAllHoldsCoverage,
        deterministicVsModel: allHoldsOverlapMetrics,
      },
    },
    deterministic: deterministicReport,
    modelCardInference: modelReport,
  };

  const reportPath = path.join(outDir, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Comparison overlay saved: ${sideBySide}`);
  console.log(`Report saved: ${reportPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
