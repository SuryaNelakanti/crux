# Vision Benchmark

Crux uses the Heidelberg/Kaggle indoor climbing hold and route segmentation
dataset as the primary local benchmark for route mask quality.

## Dataset Setup

1. Download the Kaggle dataset manually:
   `tomasslama/indoor-climbing-gym-hold-segmentation`
2. Unzip it outside tracked source, for example:
   `.data/raw/heidelberg`
3. Import VIA annotations and generate normalized ground-truth masks:

```bash
pnpm tsx scripts/vision/import-heidelberg.ts --source .data/raw/heidelberg --out .data/vision/heidelberg
```

The importer writes:
- `.data/vision/heidelberg/manifest.jsonl`
- `.data/vision/heidelberg/masks/*.png`
- `.data/vision/heidelberg/summary.json`

Raw images, imported manifests, and generated masks are intentionally ignored by
git. Review the dataset license/terms before committing any derived fixtures.

## Benchmark

Run the opt-in benchmark:

```bash
pnpm tsx scripts/vision/benchmark.ts --manifest .data/vision/heidelberg/manifest.jsonl --out scripts/output/vision-benchmark --max-width 1024
```

Render the worst-case visual QA gallery:

```bash
pnpm tsx scripts/vision/render-gallery.ts --metrics scripts/output/vision-benchmark/metrics.jsonl --out scripts/output/vision-benchmark/gallery
```

Open `scripts/output/vision-benchmark/gallery/index.html`.

## Metrics

The benchmark reports:
- all-hold pixel IoU, precision, recall, F1
- per-hold component recall
- best route-group IoU
- auto-selected route IoU
- p50 and p90 runtime

Initial target gates:
- all-hold recall >= `0.80`
- best route-group IoU >= `0.60`
- auto-selected route IoU >= `0.45`
- p90 runtime <= `1500ms` at `1024px`

## Known Failure Categories

- Low contrast gray/white holds on gray walls.
- Large volumes that are visually hold-like but not part of the route.
- Multiple routes with near-identical color families.
- Severe shadows and chalk glare that change a hold's apparent color.
- Photos where the wall border area is dominated by non-wall objects.

Use `scripts/mask-debug.ts` on individual failures:

```bash
pnpm tsx scripts/mask-debug.ts --image path/to/photo.jpg --max-width 1024
```

With an optional binary ground-truth mask:

```bash
pnpm tsx scripts/mask-debug.ts --image path/to/photo.jpg --gt-mask path/to/mask.png --max-width 1024
```

Compare deterministic output with packaged model-card inference on the same
photo:

```bash
pnpm tsx scripts/vision/compare-local-masks.ts --image path/to/photo.jpg --model-card .models/vision/crux-route-mask-model/model-card.json --out scripts/output/vision-ml/local-mask-compare
```

This local-only report reuses `scripts/mask-debug.ts` and
`scripts/vision-ml/infer-yolo-route.py`, then writes comparable selected-route
and all-holds overlays, `comparison-selected-overlays.png`,
`comparison-all-holds-overlays.png`, top model route-group overlays, and a
single `report.json` with mask overlap metrics. The deterministic side defaults
to `1024px` processing width. Model-card inference defaults to the packaged
runtime on the original photo, which keeps tiled inference comparable with the
model card; pass `--model-max-width 1024` only when intentionally debugging a
downscaled model path. Masks are resized back to the original photo dimensions
for comparison. Use `--seed-x` and `--seed-y` with original-photo coordinates to
compare the same tapped route group in both pipelines.

Run a small local Heidelberg batch report:

```bash
pnpm tsx scripts/vision/batch-compare-local-masks.ts --manifest .data/vision/heidelberg/manifest.jsonl --limit 20 --out scripts/output/vision-ml/local-mask-compare-batch --render-max-width 768 --max-det 150
```

The batch report writes `summary.json`, `rows.jsonl`, and `index.html`, and
classifies each image as detection, grouping, selection, or usable by comparing
all-holds, selected route, and top model route groups against the imported
Heidelberg masks. It keeps compact JPEG gallery assets by default and removes
per-image scratch after extracting metrics; add `--keep-case-artifacts` when a
single case needs its full raw masks and source reports preserved. The
`--max-det 150` cap keeps full-resolution phone photos within local memory while
still rendering the top route-group candidates; raise it when the machine has
enough headroom.

Replay saved top-group candidates through the local scorer tuner:

```bash
pnpm tsx scripts/vision/tune-route-group-scoring.ts --rows scripts/output/vision-ml/local-mask-compare-batch/rows.jsonl --out scripts/output/vision-ml/route-group-score-tuning
```

Use this after a batch report shows `selection` failures. Detection failures
need better labels/training data; the scorer cannot choose a route that the
model did not detect.

For the opt-in ML training/export pipeline, see `docs/vision-ml.md`.
