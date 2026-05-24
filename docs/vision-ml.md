# Vision ML Pipeline

This is the opt-in path for training a local model that improves route mask
quality beyond the deterministic TypeScript detector. It does not replace the
offline fallback in `@crux/vision`; it produces local model artifacts that can be
evaluated, exported, and integrated only after they clear benchmark gates.

## Model Direction

Use an instance segmentation model for individual holds, then reuse Crux route
grouping logic by clustering the predicted hold instances by median hold color.
This keeps the model task simple:

- Model predicts "hold" instances.
- Post-processing groups holds into candidate routes by color.
- Auto mode chooses the most plausible group.
- Seed mode chooses the group containing or nearest the tapped hold.

The default training script uses `yolo26x-seg.pt` for maximum local accuracy.
Use `yolo26m-seg.pt` or `yolo26s-seg.pt` only when local GPU memory or mobile
latency is the binding constraint.

References:
- [Ultralytics segmentation dataset format](https://docs.ultralytics.com/datasets/segment/)
- [Ultralytics Python train/predict/export usage](https://docs.ultralytics.com/usage/python/)
- [Ultralytics YOLO26 model family](https://docs.ultralytics.com/models/yolo26/)
- [Ultralytics SAM 3 usage](https://docs.ultralytics.com/models/sam-3/)

## Setup

Create an isolated Python environment:

```bash
python -m venv .venv-vision-ml
.venv-vision-ml/Scripts/python -m pip install --upgrade pip setuptools wheel
.venv-vision-ml/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
.venv-vision-ml/Scripts/python -m pip install -r scripts/vision-ml/requirements.txt
```

On macOS/Linux, activate the same environment with
`. .venv-vision-ml/bin/activate`.

Use the newest Python version supported by your installed PyTorch/Ultralytics
wheel. If the latest Python release has no matching PyTorch wheel on your
machine, use Python 3.12 for this environment.

Run the deterministic smoke test before using real data:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/smoke-pipeline.py
```

This generates a tiny synthetic manifest, converts it to YOLO segmentation
format, and packages a fake passing model card. It does not train a real model;
it verifies that the local filesystem and script wiring are sound.

To prove the local Ultralytics runtime can complete a real train/eval/export
loop on synthetic data, run the optional tiny training smoke:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/train-smoke-yolo.py --model yolo26n-seg.pt --epochs 1 --imgsz 96
```

This is not an accuracy benchmark; it intentionally packages with
`--allow-failed-gates` because the synthetic data is only a runtime check.

Capture the local training/export environment:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/report-environment.py --out scripts/output/vision-ml/environment.json
```

The readiness audit requires this report so model metrics can be tied back to
Python, package, Torch/CUDA, ONNX Runtime, CPU, and memory details.

After Kaggle auth is configured, the full local pipeline can be run with one
command after explicit training approval:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/run-local-pipeline.py --skip-download --raw-source .data/raw/heidelberg --confirm-training
```

Use `--tiled` to train on tiled hold crops and evaluate by stitching tile
predictions back onto the original images:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/run-local-pipeline.py --skip-download --raw-source .data/raw/heidelberg --tiled --train-tile-size 1024 --train-overlap 384 --tile-size 1536 --overlap 256 --confirm-training
```

For a reviewed SAM3 distillation run, pass the augmented manifest to the same
runner. The augmented manifest is used only for tiled training data; validation,
threshold tuning, packaging, and readiness checks still use the manual
Heidelberg YOLO manifest:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/run-local-pipeline.py --skip-download --raw-source .data/raw/heidelberg --tiled --augmented-manifest .data/vision/heidelberg-sam3-train/manifest.jsonl --augmented-yolo-tiles .data/vision/heidelberg-sam3-yolo-tiles --train-tile-size 1024 --train-overlap 384 --tile-size 1536 --overlap 256 --confirm-training
```

Remove `--skip-download` if you want the script to download the Kaggle dataset
itself. The full pipeline imports Heidelberg annotations, prepares YOLO data,
sweeps candidate YOLO26 segmentation models, exports the selected model,
packages it with a model card, and runs the readiness audit.
Without `--confirm-training`, it refuses to start model training.
If evaluation gates fail, the runner refuses packaging and writes the next
manual annotation batch under `scripts/output/vision-ml/annotation-candidates`.

## Dataset Preparation

Download the Kaggle dataset manually, or use the credential-backed helper after
configuring Kaggle API credentials:

```bash
kaggle auth login
.venv-vision-ml/Scripts/python scripts/vision-ml/download-heidelberg.py --out .data/raw/heidelberg
```

Then create the normalized Heidelberg manifest generated by the TypeScript
importer:

```bash
pnpm tsx scripts/vision/import-heidelberg.ts --source .data/raw/heidelberg --out .data/vision/heidelberg
```

If more labels are needed, open the local single-file annotator in Chrome or
Edge:

```text
scripts/vision/annotate-heidelberg.html
```

Select `.data/raw/heidelberg` when prompted. The annotator writes
`.data/raw/heidelberg/manual-annotation.json`, which the importer merges with
the bundled Heidelberg annotations.

To choose the next manual labeling batch, rank the unlabeled raw images by
visual diversity and write a contact sheet:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/select-annotation-candidates.py --raw-source .data/raw/heidelberg --manifest .data/vision/heidelberg/manifest.jsonl --out scripts/output/vision-ml/annotation-candidates --limit 60
```

Outputs:
- `scripts/output/vision-ml/annotation-candidates/candidates.json`
- `scripts/output/vision-ml/annotation-candidates/candidates.csv`
- `scripts/output/vision-ml/annotation-candidates/contact-sheet.jpg`

In the annotator, click `Open Heidelberg folder`, choose `.data/raw/heidelberg`,
then click `Load candidates` and select
`scripts/output/vision-ml/annotation-candidates/candidates.json`. Candidate
batch mode filters Prev/Next and the sidebar to the ranked images, while the
candidate rank stays visible beside each filename. Save appends those labels to
`.data/raw/heidelberg/manual-annotation.json`, then rerun import, YOLO
preparation, validation, training, threshold tuning, and the readiness audit.

For SAM3-assisted expansion, keep SAM3 as an offline teacher only. Download the
SAM3 checkpoint to `.models/vision/teachers/sam3.pt`, then generate reviewable
hold proposals with an open-vocabulary prompt:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/propose-sam3-labels.py --raw-source .data/raw/heidelberg --manifest .data/vision/heidelberg/manifest.jsonl --model .models/vision/teachers/sam3.pt --text "climbing hold" --out scripts/output/vision-ml/sam3-proposals --limit 120 --preview
```

Outputs:
- `scripts/output/vision-ml/sam3-proposals/proposals.json`
- `scripts/output/vision-ml/sam3-proposals/candidates.json`
- `scripts/output/vision-ml/sam3-proposals/sam3-proposals.via.json`
- optional preview overlays under `scripts/output/vision-ml/sam3-proposals/previews`

The generated VIA file is a proposal artifact, not trusted ground truth. Review
the proposals manually before using them for distillation. In
`scripts/vision/annotate-heidelberg.html`, click `Load candidates` and select
either `proposals.json` or `sam3-proposals.via.json`; proposal polygons load as
editable drafts. Delete bad masks, adjust/replace weak ones, then save the
reviewed file.

Pseudo-labels may be used to train a faster student checkpoint, but promotion
metrics must still come only from the manually labeled validation and held-out
test splits. Do not package a model card from SAM3 pseudo-label metrics.

If the reviewed SAM3 output should be used for distillation without changing
the trusted Heidelberg validation/test split, merge it into a train-only
augmented manifest:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/merge-reviewed-proposals.py --base-manifest .data/vision/heidelberg/manifest.jsonl --reviewed scripts/output/vision-ml/sam3-proposals/reviewed.via.json --out .data/vision/heidelberg-sam3-train/manifest.jsonl
```

The merge command assigns stable train/val/test splits to the manual base rows
when the base manifest is unsplit, and forces all reviewed SAM3 proposal rows
to `train`. If the base manifest already has trusted explicit splits, add
`--preserve-base-splits`.

Validate the augmented manifest before preparing YOLO data:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/validate-augmented-manifest.py --manifest .data/vision/heidelberg-sam3-train/manifest.jsonl --strict
```

Then prepare the tiled student dataset from that augmented manifest. Use
`--preserve-splits` so reviewed SAM3 rows remain train-only:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/prepare-yolo-tiles.py --manifest .data/vision/heidelberg-sam3-train/manifest.jsonl --out .data/vision/heidelberg-sam3-yolo-tiles --tile-size 1024 --overlap 384 --preserve-splits
```

Use the augmented dataset for training only. Evaluate candidate checkpoints
against `.data/vision/heidelberg-yolo/crux-manifest.jsonl` with
`evaluate-yolo-tiles.py`, so all validation and test metrics continue to come
from manually reviewed labels.

Validate the normalized manifest before converting:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/validate-dataset.py --manifest .data/vision/heidelberg/manifest.jsonl --min-images 23 --min-holds 1887 --min-routes 400 --strict
```

Convert the manifest into Ultralytics YOLO segmentation format:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/prepare-yolo-dataset.py --manifest .data/vision/heidelberg/manifest.jsonl --out .data/vision/heidelberg-yolo
```

For small holds, also prepare the tiled training set. This keeps hold polygons
near their native scale and writes a tile-level manifest that still preserves
the original route IDs for Crux evaluation:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/prepare-yolo-tiles.py --manifest .data/vision/heidelberg/manifest.jsonl --out .data/vision/heidelberg-yolo-tiles --tile-size 1024 --overlap 384
```

Validate the YOLO-side manifest and train/val/test split:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/validate-dataset.py --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --min-images 23 --min-holds 1887 --min-routes 400 --require-splits --strict
.venv-vision-ml/Scripts/python scripts/vision-ml/validate-dataset.py --manifest .data/vision/heidelberg-yolo-tiles/crux-manifest.jsonl --min-images 200 --min-holds 1887 --min-routes 400 --require-splits --strict
```

The Kaggle package contains many raw images, but the included hand annotation
files normalize to 19 annotated samples with 1,688 hold instances. The current
local manual annotation file adds 4 more images and brings the prepared dataset
to 23 annotated samples with 1,887 hold instances. Treat this as a dense
fine-tuning/evaluation set, not a broad pretraining set.

Outputs:
- `.data/vision/heidelberg-yolo/data.yaml`
- `.data/vision/heidelberg-yolo/images/{train,val,test}`
- `.data/vision/heidelberg-yolo/labels/{train,val,test}`
- `.data/vision/heidelberg-yolo/crux-manifest.jsonl`
- `.data/vision/heidelberg-yolo-tiles/data.yaml`
- `.data/vision/heidelberg-yolo-tiles/crux-manifest.jsonl`

The YOLO labels contain one `hold` instance per annotated hold polygon. Route
labels remain in `crux-manifest.jsonl` for route-group evaluation.

## Training

Do not start a long training run until the dataset validation above is clean and
the operator has confirmed the model/profile/epoch plan.

Run the preflight first; it checks CUDA, split counts, existing output
directories, disk headroom, and prints approval-ready commands without starting
training:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/preflight-training.py --data .data/vision/heidelberg-yolo/data.yaml --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl
```

High-accuracy local training:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/train-yolo-seg.py --data .data/vision/heidelberg-yolo/data.yaml --model yolo26x-seg.pt --imgsz 1024 --epochs 160 --profile accuracy
```

The script writes runs under `.models/vision/yolo-hold-seg`, including:
- `weights/best.pt`
- `weights/last.pt`
- `crux-training-summary.json`

For constrained hardware:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/train-yolo-seg.py --data .data/vision/heidelberg-yolo/data.yaml --model yolo26m-seg.pt --imgsz 1024 --epochs 160 --profile balanced
```

Training profiles:
- `accuracy`: heavier color/geometric augmentation, copy-paste, mixup, and
  mosaic for best generalization.
- `balanced`: lower augmentation for smaller GPUs.
- `speed`: reduced augmentation for quick sanity runs.

To select the best local model empirically, run a sweep:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/sweep-yolo-seg.py --data .data/vision/heidelberg-yolo/data.yaml --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --models yolo26m-seg.pt yolo26l-seg.pt yolo26x-seg.pt --imgsz 1024 --epochs 160 --profile accuracy --export-format onnx
```

The sweep trains each candidate, evaluates it with the Crux route-mask metrics,
writes `scripts/output/vision-ml/sweep/ranking.json`, and optionally exports the
top-ranked checkpoint.

## Evaluation Gates

Evaluate the trained checkpoint against the Crux manifest:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/evaluate-yolo-seg.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split val --out scripts/output/vision-ml/eval
```

Evaluate a tile-trained checkpoint by stitching tiled predictions back onto the
original full image before computing route-mask metrics:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/evaluate-yolo-tiles.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.pt --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split val --out scripts/output/vision-ml/eval-tiles --tile-size 1536 --overlap 256 --imgsz 1024 --conf 0.05 --iou 0.75
```

For runtime experiments, `evaluate-yolo-tiles.py` also supports
`--batch`, `--half`, and `--max-det`. These flags are benchmark controls only;
they do not relax the promotion gates and must be repeated on both validation
and held-out test before packaging.

Render a visual QA gallery sorted by the weakest auto-selected route IoU:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/render-gallery.py --metrics scripts/output/vision-ml/eval/metrics.jsonl --out scripts/output/vision-ml/eval-gallery
```

Tune inference thresholds on the validation split:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/tune-yolo-thresholds.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split val --out scripts/output/vision-ml/threshold-tuning
```

Use the top-ranked confidence/NMS settings from
`scripts/output/vision-ml/threshold-tuning/ranking.json` for the final eval and
model card.

Outputs:
- `scripts/output/vision-ml/eval/summary.json`
- `scripts/output/vision-ml/eval/metrics.jsonl`
- `scripts/output/vision-ml/eval/masks/*`
- `scripts/output/vision-ml/eval-gallery/index.html`

Promotion gates for the ML model are intentionally higher than the non-ML
baseline:
- all-hold recall >= `0.90`
- best route-group IoU >= `0.75`
- auto-selected route IoU >= `0.65`
- p90 runtime <= `1500ms` at `1024px`

The model is not app-ready until the validation summary clears all gates and a
gallery review shows acceptable failures.

### Current Local Run: 2026-05-13

The local Windows/CUDA run used `yolo26s-seg.pt` because the RTX 3060 Laptop
GPU has 6 GB VRAM. The first pass trained at `1024px` for 240 epochs:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/train-yolo-seg.py --data .data/vision/heidelberg-yolo/data.yaml --epochs 240 --batch 1 --device 0 --model yolo26s-seg.pt --name heidelberg-yolo26s-img1024-b1 --imgsz 1024 --workers 0 --profile balanced --patience 80
```

Artifacts:
- `.models/vision/yolo-hold-seg/heidelberg-yolo26s-img1024-b1/weights/best.pt`
- `.models/vision/yolo-hold-seg/heidelberg-yolo26s-img1024-b1/weights/best.onnx`
- `scripts/output/vision-ml/eval-yolo26s-val-selector/summary.json`
- `scripts/output/vision-ml/yolo26s-export-validation.json`
- `scripts/output/vision-ml/infer-yolo26s-onnx/report.json`

This checkpoint is useful for pipeline testing, but it is not promoted. With
the dominant saturated color-group selector and `conf=0.05`, `iou=0.75`,
validation metrics were:

| Metric | Result | Gate |
| --- | ---: | ---: |
| all-hold recall | `0.839` | `>= 0.90` |
| best route-group IoU | `0.740` | `>= 0.75` |
| auto-selected route IoU | `0.740` | `>= 0.65` |
| p90 runtime | `1106ms` | `<= 1500ms` |

A bounded `1280px` fine-tune from the first checkpoint was also run:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/train-yolo-seg.py --data .data/vision/heidelberg-yolo/data.yaml --epochs 120 --batch 1 --device 0 --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-img1024-b1/weights/best.pt --name heidelberg-yolo26s-img1280-b1-finetune --imgsz 1280 --workers 0 --profile speed --patience 35
```

It early-stopped at epoch 37 and restored epoch 2. The best validation tradeoff
for app-sized inference was the `1280px` checkpoint evaluated at `1024px` with
`conf=0.03`, `iou=0.75`:

| Metric | Result | Gate |
| --- | ---: | ---: |
| all-hold recall | `0.874` | `>= 0.90` |
| best route-group IoU | `0.756` | `>= 0.75` |
| auto-selected route IoU | `0.744` | `>= 0.65` |
| p90 runtime | `1186ms` | `<= 1500ms` |

Artifacts:
- `.models/vision/yolo-hold-seg/heidelberg-yolo26s-img1280-b1-finetune/weights/best.pt`
- `.models/vision/yolo-hold-seg/heidelberg-yolo26s-img1280-b1-finetune/weights/best.onnx`
- `scripts/output/vision-ml/threshold-tuning-yolo26s-1280ckpt-img1024/conf-0p03-iou-0p75/summary.json`
- `scripts/output/vision-ml/yolo26s-1280ckpt-export-validation.json`
- `scripts/output/vision-ml/infer-yolo26s-1280ckpt-onnx/report.json`

Lower confidence settings reached all-hold recall near `0.897`, but lost
auto-route selection. Small mask dilation can clear recall but pushes route IoU
below gate, so it is not a promotion-quality fix.

The package/model-card step must remain blocked until more labeled images or a
better checkpoint clears every gate. The current data has 23 annotated samples;
that is enough to validate the workflow but not enough to claim an extremely
accurate production model.

The tiled training path was added to test whether preserving small-hold scale
can close the recall gap:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/prepare-yolo-tiles.py --manifest .data/vision/heidelberg/manifest.jsonl --out .data/vision/heidelberg-yolo-tiles --tile-size 1024 --overlap 384
.venv-vision-ml/Scripts/python scripts/vision-ml/train-yolo-seg.py --data .data/vision/heidelberg-yolo-tiles/data.yaml --epochs 180 --batch 1 --device 0 --model yolo26s-seg.pt --name heidelberg-yolo26s-tiles1024-b1 --imgsz 1024 --workers 0 --profile balanced --patience 35
```

The tiled dataset contains 260 positive tiles from the same 23 annotated source
images and 5,596 clipped hold instances. The training run was stopped after the
tile-level validation score stabilized; the best checkpoint is:

```text
.models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.pt
```

Validation with stitched tile inference now clears the quality gates but still
misses the runtime gate:

| Metric | Result | Gate |
| --- | ---: | ---: |
| all-hold recall | `0.929` | `>= 0.90` |
| best route-group IoU | `0.818` | `>= 0.75` |
| auto-selected route IoU | `0.816` | `>= 0.65` |
| p90 runtime | `2972ms` | `<= 1500ms` |

Held-out test at the same settings clears the quality gates but still misses
the runtime gate:

| Metric | Result | Gate |
| --- | ---: | ---: |
| all-hold recall | `0.939` | `>= 0.90` |
| best route-group IoU | `0.932` | `>= 0.75` |
| auto-selected route IoU | `0.804` | `>= 0.65` |
| p90 runtime | `1712ms` | `<= 1500ms` |

The best runtime-friendly full-image setting clears runtime and auto-route on
validation, but misses all-hold recall and best route group. Therefore no model
card should be packaged from these runs yet. The next credible path is a faster
exported/quantized tiled runtime; more annotated wall styles remain useful for
generalization.

The validated ONNX export preserves the tiled quality metrics, but the
Ultralytics ONNX Runtime path did not improve tiled p90 runtime on this machine.

Additional runtime promotion attempts on 2026-05-19 before the final static
ONNX run did not produce a promotion-ready setting:

| Candidate | Validation result |
| --- | --- |
| `tiles1900-img768` fine-tune from the tiled checkpoint | Runtime passed at `1492ms`, but all-hold recall fell to `0.773`. |
| `tiles1900-img768`, lower confidence | Recall improved only to `0.801`; runtime regressed to `2149ms`. |
| `tiles1536-img1024`, `conf=0.10` | Quality gates passed, but p90 runtime was `2784ms`. |
| `tiles1536-img1024`, batched tile inference | Quality gates passed, but p90 runtime regressed to `3398ms`. |
| `tiles1536-img1024`, FP16 PyTorch inference | Quality gates passed, but p90 runtime regressed to `6412ms`. |
| `tiles1536-img1024`, `max_det=150` | Quality was unchanged, but p90 runtime regressed to `3735ms`. |
| single-pass `tile-size=3000`, `imgsz=1024` | Runtime was closer at `1596ms`, but recall and best route-group IoU failed. |
| existing `yolo26n` tiled student, `tiles1536-img1024` | Route IoU gates passed, but all-hold recall was `0.883` and p90 runtime was `3237ms`. |
| existing `yolo26n` tiled student, `tiles1900-img768` | Runtime was closer at `1589ms`, but all-hold recall and best route-group IoU failed. |

The tiled evaluator and one-shot inference script expose `--batch`, `--half`,
`--max-det`, and `--serial-tiles` so runtime experiments can be reproduced
explicitly. These are runtime controls only; they do not relax the promotion
gates.

A smaller `yolo26n` tiled student was also tried as a speed candidate. It was
stopped after early evidence showed materially weaker tile-level segmentation
quality than the existing `yolo26s` tiled checkpoint. The next credible route is
SAM3-assisted offline data expansion: use SAM3 proposals to label more raw
Heidelberg images, train a smaller/faster student with those reviewed labels,
and continue to validate only on the trusted manual val/test split.

### Promoted Local Export: 2026-05-19

The first promotion-ready local export is the tiled `yolo26s` checkpoint exported
as a static `640px` ONNX and run with serial tile inference on CUDA:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/export-yolo-seg.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.pt --format onnx --imgsz 640 --device 0
.venv-vision-ml/Scripts/python scripts/vision-ml/evaluate-yolo-tiles.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.onnx --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split val --out scripts/output/vision-ml/eval-yolo26s-tiles1536-val-static-onnx-device0-serial-img640 --tile-size 1536 --overlap 256 --imgsz 640 --conf 0.05 --iou 0.75 --device 0 --serial-tiles
.venv-vision-ml/Scripts/python scripts/vision-ml/evaluate-yolo-tiles.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.onnx --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split test --out scripts/output/vision-ml/eval-yolo26s-tiles1536-test-static-onnx-device0-serial-img640 --tile-size 1536 --overlap 256 --imgsz 640 --conf 0.05 --iou 0.75 --device 0 --serial-tiles
```

Validation gates:

| Metric | Result | Gate |
| --- | ---: | ---: |
| all-hold recall | `0.922` | `>= 0.90` |
| best route-group IoU | `0.811` | `>= 0.75` |
| auto-selected route IoU | `0.811` | `>= 0.65` |
| p90 prediction runtime | `1269ms` | `<= 1500ms` |

Held-out test gates:

| Metric | Result | Gate |
| --- | ---: | ---: |
| all-hold recall | `0.961` | `>= 0.90` |
| best route-group IoU | `0.944` | `>= 0.75` |
| auto-selected route IoU | `0.679` | `>= 0.65` |
| p90 prediction runtime | `868ms` | `<= 1500ms` |

The evaluator now reports both `runtimeMs` and `endToEndMs`. Promotion gates use
the prediction-runtime metric that existing benchmark summaries have always
used. `endToEndMs` remains higher because the local QA scripts still build
gallery-ready full-resolution masks and overlays in Python; app integration
should treat that as an implementation target, not as permission to block
capture.

## Export

Export ONNX for local desktop/web inference experiments:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/export-yolo-seg.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --format onnx --imgsz 1024 --dynamic
```

Export CoreML for iOS experiments:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/export-yolo-seg.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --format coreml --imgsz 1024
```

Validate the exported artifact before packaging:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/validate-export.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.onnx --format onnx --strict
```

Generated models stay ignored under `.models/` unless explicitly reviewed for
licensing, size, and distribution strategy.

Package a promoted export with a model card for app integration:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/package-model.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.onnx --eval-summary scripts/output/vision-ml/eval-yolo26s-tiles1536-val-static-onnx-device0-serial-img640/summary.json --dataset-manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --out .models/vision/crux-route-mask-model --imgsz 640
```

The package step refuses failed evaluation gates by default and writes
`model-card.json` with SHA-256 hashes, metric evidence, fallback policy, and the
mask method string to store with generated route-mask versions. File exports
such as ONNX and directory exports such as CoreML `.mlpackage` are both
supported.

Validate the package before integration:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/validate-model-card.py --model-card .models/vision/crux-route-mask-model/model-card.json --strict
```

## Readiness Audit

Check whether the local pipeline has every artifact needed for integration:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/check-pipeline.py --exported-model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.onnx
```

Promotion audit for the current local package:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/check-pipeline.py --manifest .data/vision/heidelberg/manifest.jsonl --yolo-data .data/vision/heidelberg-yolo-tiles/data.yaml --checkpoint .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.pt --eval-summary scripts/output/vision-ml/eval-yolo26s-tiles1536-val-static-onnx-device0-serial-img640/summary.json --exported-model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.onnx --model-card .models/vision/crux-route-mask-model/model-card.json --environment-report scripts/output/vision-ml/environment.json --out scripts/output/vision-ml/pipeline-audit.json --strict
```

For SAM3-distilled candidates, include the augmented manifest so the audit also
verifies pseudo labels stayed train-only:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/check-pipeline.py --exported-model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.onnx --augmented-manifest .data/vision/heidelberg-sam3-train/manifest.jsonl
```

Use `--strict` in CI-style runs. The audit exits non-zero unless dependencies,
dataset artifacts, trained checkpoint, evaluation gates, exported model,
environment report, and a valid packaged model card are all present.

## Single Image QA

Run local inference and save masks/overlays:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/infer-yolo-route.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --image path/to/photo.jpg --out scripts/output/vision-ml/infer
```

Run the same tiled inference shape used by the stitched benchmark:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/infer-yolo-route.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.pt --image path/to/photo.jpg --out scripts/output/vision-ml/infer --imgsz 1024 --conf 0.05 --iou 0.75 --tiled --tile-size 1536 --overlap 256
```

The report records `inferenceMode`, `tileSize`, `overlap`, and `tileCount` so
single-image QA can be compared with stitched evaluation runs.

ONNX exports are loaded with `task="segment"` inside the script so Ultralytics
does not mis-detect segmentation exports as detection models.

Run against a packaged model card:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/infer-yolo-route.py --model-card .models/vision/crux-route-mask-model/model-card.json --image path/to/photo.jpg --out scripts/output/vision-ml/infer --imgsz 640 --conf 0.05 --iou 0.75 --tiled --tile-size 1536 --overlap 256 --device 0 --serial-tiles
```

Compare packaged model-card inference against the deterministic
`generateRouteMask` fallback on one photo:

```bash
pnpm tsx scripts/vision/compare-local-masks.ts --image path/to/photo.jpg --model-card .models/vision/crux-route-mask-model/model-card.json --out scripts/output/vision-ml/local-mask-compare
```

The comparison command shells out to `scripts/mask-debug.ts` and
`scripts/vision-ml/infer-yolo-route.py`, normalizes masks to the original photo
dimensions, and writes:

- `deterministic-selected-overlay.png`
- `model-card-selected-overlay.png`
- `comparison-selected-overlays.png`
- `deterministic-all-holds-overlay.png`
- `model-card-all-holds-overlay.png`
- `comparison-all-holds-overlays.png`
- `model-card/groups/group-00-overlay.png` through the configured top groups
- `report.json` with both source reports plus selected-route and all-holds
  deterministic-vs-model IoU, precision, recall, and F1

The deterministic side defaults to `1024px` processing width so it matches the
benchmark path. Model-card inference defaults to the packaged full-resolution
tiled runtime on the original photo; use `--model-max-width 1024` only when
intentionally debugging a downscaled model path. Masks are resized back to the
original photo dimensions for comparison. `--seed-x` and `--seed-y` are original
photo coordinates; the comparison command scales them for the deterministic
resize and passes them unchanged to model-card inference.

Pass the same inference controls as the packaged command when needed, for
example `--imgsz`, `--conf`, `--iou`, `--device`, `--full-frame`, `--tile-size`,
`--overlap`, `--parallel-tiles`, `--top-groups`, `--max-det`, `--model-max-width`,
`--seed-x`, and `--seed-y`.

Run a 20-image local batch against imported Heidelberg masks:

```bash
pnpm tsx scripts/vision/batch-compare-local-masks.ts --manifest .data/vision/heidelberg/manifest.jsonl --limit 20 --out scripts/output/vision-ml/local-mask-compare-batch --render-max-width 768 --max-det 150
```

This writes a visual `index.html`, `summary.json`, and `rows.jsonl` with
ground-truth comparisons for model all-holds, deterministic all-holds, selected
route IoU, best top-group IoU, and a coarse failure mode: detection, grouping,
selection, or usable. The batch wrapper compresses gallery overlays and removes
per-image scratch by default so 20-50 image reports stay local and disk-safe;
use `--keep-case-artifacts` when investigating one case deeply. The documented
`--max-det 150` cap keeps large full-resolution phone-photo runs inside local
memory; raise it when the machine has enough headroom.

Tune route-group scoring against a completed batch report:

```bash
pnpm tsx scripts/vision/tune-route-group-scoring.ts --rows scripts/output/vision-ml/local-mask-compare-batch/rows.jsonl --out scripts/output/vision-ml/route-group-score-tuning
```

The tuner replays the top candidate groups saved in `rows.jsonl`, searches
selection-score weights, and reports whether selection failures are scoring
problems or true detection/grouping misses. Rerun the batch after applying any
scoring change; do not promote weights from a single image.

## SAM-Assisted Edge Teacher

SAM should be used as a local teacher for hold-edge proposals and label
refinement, not as the route selector. The practical split is:

- SAM proposes sharper object boundaries for candidate climbing holds.
- Reviewed SAM polygons augment train-only data.
- The Crux model learns hold instances from those edges.
- Route selection remains a Crux model/postprocess task using hold color,
  grouping, and route scoring.

Use the existing local proposal path:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/propose-sam3-labels.py --raw-source .data/raw/heidelberg --manifest .data/vision/heidelberg/manifest.jsonl --model .models/vision/teachers/sam3.pt --text "climbing hold" --out scripts/output/vision-ml/sam3-proposals --limit 120 --preview
```

Then review the proposals, merge reviewed polygons into train-only data, and
retrain the tiled YOLO route-mask model. Prioritize the current phone-image
detection failures first, because scorer tuning cannot recover routes when the
hold detector misses most holds.

Seed a route group by tap position:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/infer-yolo-route.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --image path/to/photo.jpg --seed-x 420 --seed-y 310
```

## Integration Path

1. Keep `@crux/vision` deterministic detection as the fallback and test oracle.
2. Add an optional local model runner behind a feature flag after the checkpoint
   clears the ML gates.
3. Store model metadata with app builds: model family, checkpoint hash, export
   format, input size, validation summary path, and fallback policy.
4. On mobile, run inference locally only. Do not block capture on network.
5. Save every generated mask as a new route-mask version with method metadata,
   for example `ml-yolo26-seg`, confidence, and model hash.

`@crux/vision` exports `validateRouteMaskModelCard` and
`modelMetadataFromCard` so app-side integration can validate the packaged
`model-card.json` and persist stable mask metadata without duplicating the card
schema.

## Known Risks

- Heidelberg annotations may not cover all wall/lighting styles in real gyms.
- Route grouping still depends on color separability after instance prediction.
- YOLO `x` models can be too heavy for mobile-class latency without export and
  quantization work.
- Commercial distribution requires reviewing model, framework, and dataset
  licenses before shipping weights.
