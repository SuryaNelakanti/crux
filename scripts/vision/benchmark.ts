import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import {
  bestMaskIoU,
  buildRouteMaskForGroup,
  calculateBinaryMaskMetrics,
  calculateComponentRecall,
  generateRouteMask,
  type HSL,
  type Polygon,
  percentile,
  rasterizePolygons,
  scalePolygon,
  unionMasks,
} from '../../packages/vision/src';

type Args = {
  manifest: string;
  out: string;
  maxWidth: number;
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

function parseArgs(argv: string[]): Args {
  const args: Args = {
    manifest: '.data/vision/heidelberg/manifest.jsonl',
    out: 'scripts/output/vision-benchmark',
    maxWidth: 1024,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--manifest' && argv[i + 1]) {
      args.manifest = argv[i + 1];
      i += 1;
    } else if (value === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    } else if (value === '--max-width' && argv[i + 1]) {
      args.maxWidth = Number(argv[i + 1]);
      i += 1;
    }
  }
  return {
    manifest: path.resolve(args.manifest),
    out: path.resolve(args.out),
    maxWidth: args.maxWidth,
  };
}

async function readManifest(manifestPath: string): Promise<ManifestEntry[]> {
  const content = await readFile(manifestPath, 'utf-8');
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ManifestEntry);
}

function maskToPng(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    out[i] = mask[i] ? 255 : 0;
  }
  return out;
}

async function writeMask(maskPath: string, mask: Uint8Array, width: number, height: number) {
  await mkdir(path.dirname(maskPath), { recursive: true });
  await sharp(maskToPng(mask), { raw: { width, height, channels: 1 } })
    .png()
    .toFile(maskPath);
}

function buildAllHoldPrediction(labels: Int32Array): Uint8Array {
  const mask = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] >= 0) mask[i] = 1;
  }
  return mask;
}

function buildGroundTruthMasks(entry: ManifestEntry, width: number, height: number) {
  const scaleX = width / entry.width;
  const scaleY = height / entry.height;
  const holdMasks = entry.holds.map((hold) =>
    rasterizePolygons(width, height, [scalePolygon(hold.polygon, scaleX, scaleY)])
  );
  const allHold = unionMasks(holdMasks, width * height);
  const routeMasks = entry.routes.map((route) => ({
    route,
    mask: unionMasks(
      route.holdIds
        .map((holdId) => holdMasks[holdId])
        .filter((mask): mask is Uint8Array => Boolean(mask)),
      width * height
    ),
  }));
  return { holdMasks, allHold, routeMasks };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });
  const manifest = await readManifest(args.manifest);
  const metricsPath = path.join(args.out, 'metrics.jsonl');
  const metricsLines: string[] = [];
  const timings: number[] = [];
  const summaries = {
    allHoldIou: [] as number[],
    allHoldPrecision: [] as number[],
    allHoldRecall: [] as number[],
    allHoldF1: [] as number[],
    componentRecall: [] as number[],
    bestRouteGroupIou: [] as number[],
    autoRouteIou: [] as number[],
  };

  for (const entry of manifest) {
    const { data, info } = await sharp(entry.imagePath)
      .resize({ width: args.maxWidth, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width ?? 0;
    const height = info.height ?? 0;
    if (!width || !height) continue;
    const pixels = new Uint8ClampedArray(data);
    const groundTruth = buildGroundTruthMasks(entry, width, height);

    const start = performance.now();
    const result = generateRouteMask({ pixels, width, height });
    const runtimeMs = performance.now() - start;
    timings.push(runtimeMs);

    const predictedAllHolds = buildAllHoldPrediction(result.detection.labels);
    const allHoldMetrics = calculateBinaryMaskMetrics(predictedAllHolds, groundTruth.allHold);
    const componentRecall = calculateComponentRecall({
      predicted: predictedAllHolds,
      components: groundTruth.holdMasks,
    });
    const predictedGroupMasks = result.groups.map((group) =>
      buildRouteMaskForGroup(result.detection, group)
    );
    const routeMasks = groundTruth.routeMasks.map((route) => route.mask);
    const bestRouteGroupIou = bestMaskIoU(predictedGroupMasks, routeMasks);
    const autoRouteIou = routeMasks.reduce(
      (best, routeMask) => Math.max(best, calculateBinaryMaskMetrics(result.mask, routeMask).iou),
      0
    );

    summaries.allHoldIou.push(allHoldMetrics.iou);
    summaries.allHoldPrecision.push(allHoldMetrics.precision);
    summaries.allHoldRecall.push(allHoldMetrics.recall);
    summaries.allHoldF1.push(allHoldMetrics.f1);
    summaries.componentRecall.push(componentRecall);
    summaries.bestRouteGroupIou.push(bestRouteGroupIou);
    summaries.autoRouteIou.push(autoRouteIou);

    const selectedMaskPath = path.join(args.out, 'masks', `${entry.id}-selected.png`);
    const predictedHoldsMaskPath = path.join(args.out, 'masks', `${entry.id}-predicted-holds.png`);
    await writeMask(selectedMaskPath, result.mask, width, height);
    await writeMask(predictedHoldsMaskPath, predictedAllHolds, width, height);

    metricsLines.push(
      JSON.stringify({
        id: entry.id,
        imagePath: entry.imagePath,
        width,
        height,
        runtimeMs,
        confidence: result.confidence,
        fallback: result.fallback,
        groupCount: result.groups.length,
        selectedGroupId: result.selectedGroupId,
        selectedMaskPath: path.relative(args.out, selectedMaskPath),
        predictedHoldsMaskPath: path.relative(args.out, predictedHoldsMaskPath),
        allHold: allHoldMetrics,
        componentRecall,
        bestRouteGroupIou,
        autoRouteIou,
      })
    );
  }

  await writeFile(metricsPath, `${metricsLines.join('\n')}\n`, 'utf-8');

  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const summary = {
    imageCount: metricsLines.length,
    maxWidth: args.maxWidth,
    allHold: {
      iou: average(summaries.allHoldIou),
      precision: average(summaries.allHoldPrecision),
      recall: average(summaries.allHoldRecall),
      f1: average(summaries.allHoldF1),
    },
    componentRecall: average(summaries.componentRecall),
    bestRouteGroupIou: average(summaries.bestRouteGroupIou),
    autoRouteIou: average(summaries.autoRouteIou),
    runtimeMs: {
      p50: percentile(timings, 50),
      p90: percentile(timings, 90),
    },
    gates: {
      allHoldRecall: average(summaries.allHoldRecall) >= 0.8,
      bestRouteGroupIou: average(summaries.bestRouteGroupIou) >= 0.6,
      autoRouteIou: average(summaries.autoRouteIou) >= 0.45,
      p90RuntimeMs: percentile(timings, 90) <= 1500,
    },
  };

  await writeFile(path.join(args.out, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Benchmarked ${metricsLines.length} images`);
  console.log(`Summary: ${path.join(args.out, 'summary.json')}`);
  console.log(`Metrics: ${metricsPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
