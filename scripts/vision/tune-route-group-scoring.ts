import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Args = {
  rowsPath: string;
  outDir: string;
  minModelAllHoldF1: number;
  rawScoreDivisor: number;
};

type Weights = {
  raw: number;
  coverage: number;
  saturation: number;
  lightness: number;
  holdCount: number;
  spread: number;
  edgePenalty: number;
  lightnessPenalty: number;
  wideSpreadPenalty: number;
};

type TopGroup = {
  rank: number;
  groupId?: number;
  iou: number;
  score?: number;
  selectionScore?: number;
  selection?: Record<string, number>;
};

type BatchRow = {
  id: string;
  failureMode: string;
  model: {
    allHold: { f1: number };
    selectedRouteIou: number;
    bestTopGroupIou: number;
  };
  topGroupIous: TopGroup[];
};

type EvaluatedRow = {
  id: string;
  originalFailureMode: string;
  tunedFailureMode: string;
  modelAllHoldF1: number;
  originalSelectedRouteIou: number;
  tunedSelectedRouteIou: number;
  bestTopGroupIou: number;
  selectedRank: number;
  selectedGroupId: number | null;
  selectedScore: number;
  delta: number;
};

const currentWeights: Weights = {
  raw: 0.22,
  coverage: 0.14,
  saturation: 0.26,
  lightness: 0.12,
  holdCount: 0.08,
  spread: 0.02,
  edgePenalty: 0.8,
  lightnessPenalty: 0.8,
  wideSpreadPenalty: 0.6,
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    rowsPath: 'scripts/output/vision-ml/local-mask-compare-batch-20-tuned/rows.jsonl',
    outDir: 'scripts/output/vision-ml/route-group-score-tuning',
    minModelAllHoldF1: 0.35,
    rawScoreDivisor: 600,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    const next = argv[i + 1];
    if (value === '--rows' && next) {
      args.rowsPath = next;
      i += 1;
    } else if (value === '--out' && next) {
      args.outDir = next;
      i += 1;
    } else if (value === '--min-model-all-hold-f1' && next) {
      args.minModelAllHoldF1 = Number(next);
      i += 1;
    } else if (value === '--raw-score-divisor' && next) {
      args.rawScoreDivisor = Number(next);
      i += 1;
    }
  }
  return {
    ...args,
    rowsPath: path.resolve(args.rowsPath),
    outDir: path.resolve(args.outDir),
  };
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const readRows = async (rowsPath: string): Promise<BatchRow[]> => {
  const content = await readFile(rowsPath, 'utf-8');
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BatchRow);
};

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

const value = (group: TopGroup, key: string) => group.selection?.[key] ?? 0;

const scoreGroup = (group: TopGroup, weights: Weights, rawScoreDivisor: number) => {
  const raw = Math.min(1, Math.max(0, (group.score ?? 0) / rawScoreDivisor));
  return (
    raw * weights.raw +
    value(group, 'coverageScore') * weights.coverage +
    value(group, 'saturationScore') * weights.saturation +
    value(group, 'lightnessScore') * weights.lightness +
    value(group, 'holdCountScore') * weights.holdCount +
    value(group, 'spreadScore') * weights.spread -
    value(group, 'edgePenalty') * weights.edgePenalty -
    value(group, 'lightnessPenalty') * weights.lightnessPenalty -
    value(group, 'wideSpreadPenalty') * weights.wideSpreadPenalty
  );
};

const selectGroup = (row: BatchRow, weights: Weights, rawScoreDivisor: number) =>
  row.topGroupIous.reduce<{
    group: TopGroup | null;
    score: number;
  }>(
    (best, group) => {
      const score = scoreGroup(group, weights, rawScoreDivisor);
      if (!best.group || score > best.score) return { group, score };
      return best;
    },
    { group: null, score: Number.NEGATIVE_INFINITY }
  );

const summarizeModes = (rows: EvaluatedRow[]) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.tunedFailureMode] = (acc[row.tunedFailureMode] ?? 0) + 1;
    return acc;
  }, {});

const evaluate = (
  rows: BatchRow[],
  weights: Weights,
  args: Pick<Args, 'minModelAllHoldF1' | 'rawScoreDivisor'>
) => {
  const evaluatedRows: EvaluatedRow[] = rows.map((row) => {
    const bestTopGroupIou = Math.max(0, ...row.topGroupIous.map((group) => group.iou));
    const canTune = row.model.allHold.f1 >= args.minModelAllHoldF1 && row.topGroupIous.length > 0;
    const selected = canTune
      ? selectGroup(row, weights, args.rawScoreDivisor)
      : { group: null, score: 0 };
    const selectedIou = selected.group?.iou ?? row.model.selectedRouteIou;
    const tunedFailureMode = classify({
      modelAllHoldF1: row.model.allHold.f1,
      selectedRouteIou: selectedIou,
      bestTopGroupIou,
    });
    return {
      id: row.id,
      originalFailureMode: row.failureMode,
      tunedFailureMode,
      modelAllHoldF1: row.model.allHold.f1,
      originalSelectedRouteIou: row.model.selectedRouteIou,
      tunedSelectedRouteIou: selectedIou,
      bestTopGroupIou,
      selectedRank: selected.group?.rank ?? -1,
      selectedGroupId: selected.group?.groupId ?? null,
      selectedScore: selected.score,
      delta: selectedIou - row.model.selectedRouteIou,
    };
  });
  const tunableRows = evaluatedRows.filter((row) => row.modelAllHoldF1 >= args.minModelAllHoldF1);
  const selectionGap = average(
    tunableRows.map((row) => Math.max(0, row.bestTopGroupIou - row.tunedSelectedRouteIou))
  );
  return {
    rows: evaluatedRows,
    imageCount: evaluatedRows.length,
    tunableImageCount: tunableRows.length,
    averageSelectedRouteIou: average(evaluatedRows.map((row) => row.tunedSelectedRouteIou)),
    tunableAverageSelectedRouteIou: average(tunableRows.map((row) => row.tunedSelectedRouteIou)),
    averageBestTopGroupIou: average(evaluatedRows.map((row) => row.bestTopGroupIou)),
    selectionGap,
    byFailureMode: summarizeModes(evaluatedRows),
  };
};

const gridValues = {
  raw: [0.14, 0.18, 0.22, 0.26, 0.3],
  coverage: [0.14, 0.18, 0.2, 0.24],
  saturation: [0.14, 0.18, 0.22, 0.26, 0.3],
  lightness: [0.12, 0.16, 0.2, 0.24],
  holdCount: [0.04, 0.08, 0.12],
  spread: [0, 0.02, 0.04, 0.06],
  edgePenalty: [0.8, 1, 1.2],
  lightnessPenalty: [0.8, 1, 1.2],
  wideSpreadPenalty: [0.6, 1, 1.4],
};

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await readRows(args.rowsPath);
  const featureRows = rows.filter((row) =>
    row.topGroupIous.some((group) => group.selection && Object.keys(group.selection).length > 0)
  );
  if (featureRows.length !== rows.length) {
    throw new Error(
      `Rows file is missing top-group selection features for ${
        rows.length - featureRows.length
      } rows. Rerun scripts/vision/batch-compare-local-masks.ts with the current code.`
    );
  }

  const baseline = evaluate(rows, currentWeights, args);
  let best = { weights: currentWeights, evaluation: baseline, objective: Number.NEGATIVE_INFINITY };

  for (const raw of gridValues.raw) {
    for (const coverage of gridValues.coverage) {
      for (const saturation of gridValues.saturation) {
        for (const lightness of gridValues.lightness) {
          for (const holdCount of gridValues.holdCount) {
            for (const spread of gridValues.spread) {
              for (const edgePenalty of gridValues.edgePenalty) {
                for (const lightnessPenalty of gridValues.lightnessPenalty) {
                  for (const wideSpreadPenalty of gridValues.wideSpreadPenalty) {
                    const weights = {
                      raw,
                      coverage,
                      saturation,
                      lightness,
                      holdCount,
                      spread,
                      edgePenalty,
                      lightnessPenalty,
                      wideSpreadPenalty,
                    };
                    const evaluation = evaluate(rows, weights, args);
                    const objective =
                      evaluation.tunableAverageSelectedRouteIou -
                      evaluation.selectionGap * 0.15 -
                      (evaluation.byFailureMode.selection ?? 0) * 0.005;
                    if (objective > best.objective) {
                      best = { weights, evaluation, objective };
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const result = {
    inputs: {
      rows: args.rowsPath,
      minModelAllHoldF1: args.minModelAllHoldF1,
      rawScoreDivisor: args.rawScoreDivisor,
    },
    baseline: {
      weights: currentWeights,
      ...baseline,
      rows: undefined,
    },
    best: {
      weights: best.weights,
      objective: best.objective,
      ...best.evaluation,
      rows: undefined,
    },
    deltas: {
      averageSelectedRouteIou:
        best.evaluation.averageSelectedRouteIou - baseline.averageSelectedRouteIou,
      tunableAverageSelectedRouteIou:
        best.evaluation.tunableAverageSelectedRouteIou - baseline.tunableAverageSelectedRouteIou,
      selectionGap: best.evaluation.selectionGap - baseline.selectionGap,
    },
    rows: best.evaluation.rows.sort((a, b) => a.id.localeCompare(b.id)),
  };

  await mkdir(args.outDir, { recursive: true });
  await writeFile(path.join(args.outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf-8');
  await writeFile(
    path.join(args.outDir, 'rows.jsonl'),
    result.rows.map((row) => JSON.stringify(row)).join('\n'),
    'utf-8'
  );
  console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
