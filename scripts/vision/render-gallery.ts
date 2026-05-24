import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

type Args = {
  metrics: string;
  out: string;
  limit: number;
};

type MetricRow = {
  id: string;
  imagePath: string;
  width: number;
  height: number;
  selectedMaskPath: string;
  predictedHoldsMaskPath: string;
  runtimeMs: number;
  confidence: number;
  fallback: boolean;
  allHold: { iou: number; precision: number; recall: number; f1: number };
  componentRecall: number;
  bestRouteGroupIou: number;
  autoRouteIou: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    metrics: 'scripts/output/vision-benchmark/metrics.jsonl',
    out: 'scripts/output/vision-benchmark/gallery',
    limit: 100,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--metrics' && argv[i + 1]) {
      args.metrics = argv[i + 1];
      i += 1;
    } else if (value === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    } else if (value === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[i + 1]);
      i += 1;
    }
  }
  return {
    metrics: path.resolve(args.metrics),
    out: path.resolve(args.out),
    limit: args.limit,
  };
}

async function readMetrics(metricsPath: string): Promise<MetricRow[]> {
  const content = await readFile(metricsPath, 'utf-8');
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as MetricRow);
}

async function makeOverlay(params: {
  imagePath: string;
  maskPath: string;
  width: number;
  height: number;
  color: { r: number; g: number; b: number; a: number };
  outPath: string;
}) {
  const mask = await sharp(params.maskPath).resize(params.width, params.height).raw().toBuffer();
  const overlay = new Uint8Array(params.width * params.height * 4);
  for (let i = 0; i < params.width * params.height; i += 1) {
    if (!mask[i]) continue;
    const offset = i * 4;
    overlay[offset] = params.color.r;
    overlay[offset + 1] = params.color.g;
    overlay[offset + 2] = params.color.b;
    overlay[offset + 3] = params.color.a;
  }

  await sharp(params.imagePath)
    .resize({ width: params.width, height: params.height, fit: 'fill' })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from(overlay),
        raw: { width: params.width, height: params.height, channels: 4 },
      },
    ])
    .jpeg({ quality: 88 })
    .toFile(params.outPath);
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });
  const metricsDir = path.dirname(args.metrics);
  const rows = (await readMetrics(args.metrics))
    .sort((a, b) => a.autoRouteIou - b.autoRouteIou)
    .slice(0, args.limit);

  const cards: string[] = [];
  for (const row of rows) {
    const selectedMaskPath = path.resolve(metricsDir, row.selectedMaskPath);
    const holdsMaskPath = path.resolve(metricsDir, row.predictedHoldsMaskPath);
    const selectedOverlay = `${row.id}-selected.jpg`;
    const holdsOverlay = `${row.id}-holds.jpg`;

    await makeOverlay({
      imagePath: row.imagePath,
      maskPath: selectedMaskPath,
      width: row.width,
      height: row.height,
      color: { r: 47, g: 191, b: 156, a: 190 },
      outPath: path.join(args.out, selectedOverlay),
    });
    await makeOverlay({
      imagePath: row.imagePath,
      maskPath: holdsMaskPath,
      width: row.width,
      height: row.height,
      color: { r: 255, g: 245, b: 210, a: 165 },
      outPath: path.join(args.out, holdsOverlay),
    });

    cards.push(`
      <article class="card">
        <h2>${row.id}</h2>
        <div class="grid">
          <figure><img src="${holdsOverlay}" alt="All detected holds"><figcaption>All holds</figcaption></figure>
          <figure><img src="${selectedOverlay}" alt="Selected route"><figcaption>Selected route</figcaption></figure>
        </div>
        <p>Auto route IoU ${pct(row.autoRouteIou)} · Best group IoU ${pct(row.bestRouteGroupIou)} · Hold recall ${pct(row.allHold.recall)} · ${Math.round(row.runtimeMs)}ms</p>
      </article>
    `);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Crux Vision Benchmark Gallery</title>
  <style>
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #f4f0e8; color: #201f1b; }
    h1 { margin: 0 0 18px; }
    .card { margin: 0 0 28px; padding: 16px; background: #fbf8f1; border: 1px solid #d9d1c4; border-radius: 8px; }
    .card h2 { margin: 0 0 12px; font-size: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    figure { margin: 0; }
    img { width: 100%; height: auto; display: block; border-radius: 6px; }
    figcaption, p { color: #5d584f; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Crux Vision Benchmark Gallery</h1>
  ${cards.join('\n')}
</body>
</html>`;

  await writeFile(path.join(args.out, 'index.html'), html, 'utf-8');
  console.log(`Gallery: ${path.join(args.out, 'index.html')}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
