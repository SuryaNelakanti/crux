import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { calculateBinaryMaskMetrics } from '../../packages/vision/src';

type Args = {
  manifest: string;
  outDir: string;
  modelCardPath: string;
  pythonPath: string;
  limit: number;
  deterministicMaxWidth: number;
  modelMaxWidth: number;
  renderMaxWidth: number;
  imgsz: number;
  conf: number;
  iou: number;
  maxDet: number;
  device?: string;
  topGroups: number;
  keepCaseArtifacts: boolean;
};

type ManifestEntry = {
  id: string;
  imagePath: string;
  width: number;
  height: number;
  allHoldMaskPath: string;
  routes: { id: string; label: string; maskPath: string }[];
};

type CompareReport = {
  image: string;
  outputs: {
    sideBySide: string;
    allHoldsSideBySide: string;
    topModelGroups: {
      rank: number;
      groupId: number;
      mask: string;
      overlay: string;
      area: number;
      instanceCount: number;
      score: number;
      color: { h: number; s: number; l: number };
      selection: Record<string, number>;
    }[];
  };
  modelCardInference: {
    outputs: {
      selectedRouteMask: string;
      allHoldsMask: string;
    };
    selectedGroupId: number | null;
    instanceCount: number;
    groupCount: number;
  };
  deterministic: {
    coverage: number;
    confidence: number;
    selectedGroupId: number | null;
    holdCount: number;
    groupCount: number;
  };
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    manifest: '.data/vision/heidelberg/manifest.jsonl',
    outDir: 'scripts/output/vision-ml/local-mask-compare-batch',
    modelCardPath: '.models/vision/crux-route-mask-model/model-card.json',
    pythonPath: '.venv-vision-ml/Scripts/python',
    limit: 20,
    deterministicMaxWidth: 1024,
    modelMaxWidth: 0,
    renderMaxWidth: 768,
    imgsz: 640,
    conf: 0.05,
    iou: 0.75,
    maxDet: 150,
    topGroups: 5,
    keepCaseArtifacts: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    const next = argv[i + 1];
    if (value === '--manifest' && next) {
      args.manifest = next;
      i += 1;
    } else if (value === '--out' && next) {
      args.outDir = next;
      i += 1;
    } else if (value === '--model-card' && next) {
      args.modelCardPath = next;
      i += 1;
    } else if (value === '--python' && next) {
      args.pythonPath = next;
      i += 1;
    } else if (value === '--limit' && next) {
      args.limit = Number(next);
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
    } else if (value === '--imgsz' && next) {
      args.imgsz = Number(next);
      i += 1;
    } else if (value === '--conf' && next) {
      args.conf = Number(next);
      i += 1;
    } else if (value === '--iou' && next) {
      args.iou = Number(next);
      i += 1;
    } else if (value === '--max-det' && next) {
      args.maxDet = Number(next);
      i += 1;
    } else if (value === '--device' && next) {
      args.device = next;
      i += 1;
    } else if (value === '--top-groups' && next) {
      args.topGroups = Number(next);
      i += 1;
    } else if (value === '--keep-case-artifacts') {
      args.keepCaseArtifacts = true;
    }
  }
  return {
    ...args,
    manifest: path.resolve(args.manifest),
    outDir: path.resolve(args.outDir),
    modelCardPath: path.resolve(args.modelCardPath),
    pythonPath: path.resolve(args.pythonPath),
  };
};

const runCommand = (command: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const appendOutput = (chunk: Buffer) => {
      output = `${output}${chunk.toString('utf-8')}`.slice(-6000);
    };
    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}\n${output}`)
      );
    });
  });

const readManifest = async (manifestPath: string): Promise<ManifestEntry[]> => {
  const content = await readFile(manifestPath, 'utf-8');
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ManifestEntry);
};

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

const bestRouteIou = (predicted: Uint8Array, routes: Uint8Array[]) =>
  routes.reduce(
    (best, route) => Math.max(best, calculateBinaryMaskMetrics(predicted, route).iou),
    0
  );

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const classify = (params: {
  modelAllHoldF1: number;
  selectedRouteIou: number;
  bestTopGroupIou: number;
}) => {
  if (params.modelAllHoldF1 < 0.35) return 'detection';
  if (params.bestTopGroupIou >= params.selectedRouteIou + 0.15) return 'selection';
  if (params.bestTopGroupIou < 0.25) return 'grouping';
  return 'usable';
};

const writeCompactJpeg = async (source: string, destination: string) => {
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp(source).jpeg({ quality: 76, mozjpeg: true }).toFile(destination);
};

async function runOne(args: Args, manifestRoot: string, entry: ManifestEntry) {
  const caseOut = path.join(args.outDir, args.keepCaseArtifacts ? 'cases' : '.scratch', entry.id);
  await mkdir(caseOut, { recursive: true });
  const commandArgs = [
    path.resolve('node_modules/tsx/dist/cli.mjs'),
    'scripts/vision/compare-local-masks.ts',
    '--image',
    path.resolve(entry.imagePath),
    '--model-card',
    args.modelCardPath,
    '--python',
    args.pythonPath,
    '--out',
    caseOut,
    '--deterministic-max-width',
    String(args.deterministicMaxWidth),
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
    '--model-max-width',
    String(args.modelMaxWidth),
    '--render-max-width',
    String(args.renderMaxWidth),
  ];
  if (args.device) commandArgs.push('--device', args.device);
  await runCommand(process.execPath, commandArgs);

  const reportPath = path.join(caseOut, 'report.json');
  const report = await readJson<CompareReport>(reportPath);
  const allHoldGroundTruth = await readMask(
    path.resolve(manifestRoot, entry.allHoldMaskPath),
    entry.width,
    entry.height,
    'luma'
  );
  const routeMasks = await Promise.all(
    entry.routes.map((route) =>
      readMask(path.resolve(manifestRoot, route.maskPath), entry.width, entry.height, 'luma')
    )
  );
  const deterministicSelected = await readMask(
    path.join(caseOut, 'deterministic', 'route-mask.png'),
    entry.width,
    entry.height,
    'alpha'
  );
  const deterministicAllHolds = await readMask(
    path.join(caseOut, 'deterministic', 'all-holds-mask.png'),
    entry.width,
    entry.height,
    'alpha'
  );
  const modelSelected = await readMask(
    report.modelCardInference.outputs.selectedRouteMask,
    entry.width,
    entry.height,
    'luma'
  );
  const modelAllHolds = await readMask(
    report.modelCardInference.outputs.allHoldsMask,
    entry.width,
    entry.height,
    'luma'
  );
  const rawTopGroupIous = await Promise.all(
    report.outputs.topModelGroups.map(async (group) => {
      const mask = await readMask(group.mask, entry.width, entry.height, 'luma');
      return {
        rank: group.rank,
        groupId: group.groupId,
        iou: bestRouteIou(mask, routeMasks),
        overlay: group.overlay,
        area: group.area,
        instanceCount: group.instanceCount,
        score: group.score,
        color: group.color,
        selection: group.selection,
        selectionScore: group.selection.score,
      };
    })
  );
  const bestTopGroupIou = Math.max(0, ...rawTopGroupIous.map((group) => group.iou));
  const modelAllHoldMetrics = calculateBinaryMaskMetrics(modelAllHolds, allHoldGroundTruth);
  const deterministicAllHoldMetrics = calculateBinaryMaskMetrics(
    deterministicAllHolds,
    allHoldGroundTruth
  );
  const modelSelectedRouteIou = bestRouteIou(modelSelected, routeMasks);
  const deterministicSelectedRouteIou = bestRouteIou(deterministicSelected, routeMasks);
  const compactOut = path.join(args.outDir, 'assets', entry.id);
  const selectedComparisonOverlay = path.join(compactOut, 'selected-comparison.jpg');
  const allHoldsComparisonOverlay = path.join(compactOut, 'all-holds-comparison.jpg');
  await writeCompactJpeg(report.outputs.sideBySide, selectedComparisonOverlay);
  await writeCompactJpeg(report.outputs.allHoldsSideBySide, allHoldsComparisonOverlay);
  const topGroupOverlays = await Promise.all(
    rawTopGroupIous.map(async (group) => {
      const overlay = path.join(
        compactOut,
        `model-group-${String(group.rank).padStart(2, '0')}.jpg`
      );
      await writeCompactJpeg(group.overlay, overlay);
      return overlay;
    })
  );
  const topGroupIous = rawTopGroupIous.map((group, index) => ({
    ...group,
    overlay: topGroupOverlays[index] ?? group.overlay,
  }));
  if (!args.keepCaseArtifacts) {
    await rm(caseOut, { recursive: true, force: true });
  }
  return {
    id: entry.id,
    imagePath: entry.imagePath,
    reportPath: args.keepCaseArtifacts ? reportPath : null,
    selectedComparisonOverlay,
    allHoldsComparisonOverlay,
    topGroupOverlays,
    model: {
      allHold: modelAllHoldMetrics,
      selectedRouteIou: modelSelectedRouteIou,
      bestTopGroupIou,
      selectedGroupId: report.modelCardInference.selectedGroupId,
      instanceCount: report.modelCardInference.instanceCount,
      groupCount: report.modelCardInference.groupCount,
    },
    deterministic: {
      allHold: deterministicAllHoldMetrics,
      selectedRouteIou: deterministicSelectedRouteIou,
      confidence: report.deterministic.confidence,
      selectedGroupId: report.deterministic.selectedGroupId,
      holdCount: report.deterministic.holdCount,
      groupCount: report.deterministic.groupCount,
    },
    topGroupIous,
    failureMode: classify({
      modelAllHoldF1: modelAllHoldMetrics.f1,
      selectedRouteIou: modelSelectedRouteIou,
      bestTopGroupIou,
    }),
  };
}

const rel = (from: string, to: string) => path.relative(from, to).replace(/\\/g, '/');
const pct = (value: number) => `${Math.round(value * 100)}%`;

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });
  const manifestRoot = path.dirname(args.manifest);
  const entries = (await readManifest(args.manifest)).slice(0, args.limit);
  const rows = [];
  for (const entry of entries) {
    rows.push(await runOne(args, manifestRoot, entry));
  }

  const byFailureMode = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.failureMode] = (acc[row.failureMode] ?? 0) + 1;
    return acc;
  }, {});
  const summary = {
    imageCount: rows.length,
    inputs: {
      manifest: args.manifest,
      modelCard: args.modelCardPath,
      deterministicMaxWidth: args.deterministicMaxWidth,
      modelMaxWidth: args.modelMaxWidth,
      renderMaxWidth: args.renderMaxWidth,
      imgsz: args.imgsz,
      conf: args.conf,
      iou: args.iou,
      maxDet: args.maxDet,
      topGroups: args.topGroups,
      keepCaseArtifacts: args.keepCaseArtifacts,
      device: args.device ?? null,
    },
    averages: {
      modelAllHoldF1: average(rows.map((row) => row.model.allHold.f1)),
      modelSelectedRouteIou: average(rows.map((row) => row.model.selectedRouteIou)),
      modelBestTopGroupIou: average(rows.map((row) => row.model.bestTopGroupIou)),
      deterministicAllHoldF1: average(rows.map((row) => row.deterministic.allHold.f1)),
      deterministicSelectedRouteIou: average(rows.map((row) => row.deterministic.selectedRouteIou)),
    },
    byFailureMode,
  };

  await writeFile(
    path.join(args.outDir, 'rows.jsonl'),
    rows.map((row) => JSON.stringify(row)).join('\n'),
    'utf-8'
  );
  await writeFile(
    path.join(args.outDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );

  const cards = rows
    .map((row) => {
      const topGroups = row.topGroupOverlays
        .slice(0, 3)
        .map(
          (overlay, index) =>
            `<figure><img src="${rel(args.outDir, overlay)}"><figcaption>Model group ${index}</figcaption></figure>`
        )
        .join('\n');
      return `<article>
  <h2>${row.id} - ${row.failureMode}</h2>
  <p>Model selected ${pct(row.model.selectedRouteIou)} - best top group ${pct(row.model.bestTopGroupIou)} - model hold F1 ${pct(row.model.allHold.f1)} - deterministic selected ${pct(row.deterministic.selectedRouteIou)}</p>
  <div class="grid">
    <figure><img src="${rel(args.outDir, row.selectedComparisonOverlay)}"><figcaption>Selected comparison</figcaption></figure>
    <figure><img src="${rel(args.outDir, row.allHoldsComparisonOverlay)}"><figcaption>All-holds comparison</figcaption></figure>
    ${topGroups}
  </div>
</article>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Crux Local Mask Comparison Batch</title>
  <style>
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #f7f4ef; color: #1f211f; }
    h1 { margin: 0 0 8px; }
    article { margin: 24px 0; padding-top: 18px; border-top: 1px solid #d8d2c8; }
    h2 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0 0 12px; color: #5d5d56; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    figure { margin: 0; }
    img { width: 100%; height: auto; display: block; border-radius: 6px; }
    figcaption { margin-top: 4px; color: #69665f; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Crux Local Mask Comparison Batch</h1>
  <p>${rows.length} images - model selected ${pct(summary.averages.modelSelectedRouteIou)} - best top group ${pct(summary.averages.modelBestTopGroupIou)} - model hold F1 ${pct(summary.averages.modelAllHoldF1)}</p>
  ${cards}
</body>
</html>`;
  await writeFile(path.join(args.outDir, 'index.html'), html, 'utf-8');
  console.log(`Batch summary: ${path.join(args.outDir, 'summary.json')}`);
  console.log(`Batch gallery: ${path.join(args.outDir, 'index.html')}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
