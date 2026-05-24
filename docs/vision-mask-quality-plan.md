# Route Mask Quality Plan

This note captures the next local-only route-mask work after the packaged
model-card comparison harness became usable.

## Current Evidence

Authoritative local report:
`scripts/output/vision-ml/local-mask-compare-batch-20-auto-tuned/summary.json`

Command:

```bash
pnpm tsx scripts/vision/batch-compare-local-masks.ts --manifest .data/vision/heidelberg/manifest.jsonl --model-card .models/vision/crux-route-mask-model/model-card.json --out scripts/output/vision-ml/local-mask-compare-batch-20-auto-tuned --limit 20 --render-max-width 384 --top-groups 5 --max-det 150 --device cpu
```

Results:

- Model all-hold F1: `0.660`
- Model selected-route IoU: `0.477`
- Model best top-group IoU: `0.559`
- Deterministic selected-route IoU: `0.372`
- Failure modes: `12 usable`, `4 selection`, `4 detection`

The route-group scorer tuner confirms the applied weights are the best candidate
inside the current constrained search grid:
`scripts/output/vision-ml/route-group-score-tuning-auto-tuned/result.json`

## Remaining Selection Failures

These cases detect holds well enough, but choose the wrong route group:

- `bh_0000`: selected `0.541`, best top group `0.757`
- `bh_0075`: selected `0.258`, best top group `0.704`
- `bh_0530`: selected `0.341`, best top group `0.551`
- `bh_0647`: selected `0.525`, best top group `0.730`

Next action:

1. Run `scripts/vision/tune-route-group-scoring.ts` after every comparison
   batch instead of hand-tuning weights.
2. Add more top candidates with `--top-groups 8` for selection-failure analysis
   only; keep normal reports at `5`.
3. Inspect whether misses are same-color route ambiguity or volume/wall-color
   leakage before expanding the scorer features.

## Remaining Detection Failures

These are phone-image detector misses; scoring cannot recover a route that is
not detected:

- `bh-phone_105`: all-hold F1 `0.096`
- `bh-phone_126`: all-hold F1 `0.020`
- `bh-phone_182`: all-hold F1 `0.043`
- `bh-phone_185`: all-hold F1 `0.030`

Next action:

1. Prioritize these four phone images for label review.
2. Generate SAM-assisted hold-edge proposals locally.
3. Review proposals manually and merge only reviewed polygons into train-only
   augmented data.
4. Retrain/evaluate the tiled model with a phone-heavy validation slice.

## SAM Role

SAM can help, but it should be a local edge teacher, not the route decision
engine.

Use SAM for:

- sharper object boundary proposals around holds;
- improving polygon quality for phone images;
- pseudo-label suggestions that a human reviews before training.

Keep the Crux model responsible for:

- hold detection at runtime;
- route candidate grouping;
- route selection from detected holds.

Local proposal command:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/propose-sam3-labels.py --raw-source .data/raw/heidelberg --manifest .data/vision/heidelberg/manifest.jsonl --model .models/vision/teachers/sam3.pt --text "climbing hold" --out scripts/output/vision-ml/sam3-proposals-phone-failures --include-annotated --limit 120 --preview
```

Review the generated VIA/proposal output, keep only true holds, then merge into
train-only augmented data with `scripts/vision-ml/merge-reviewed-proposals.py`.
