# Combo Route Mask Runtime Plan

## Goal

Move the target product path from deterministic dominant-color masking to a local
combo inference pipeline:

```text
photo
  -> SAM-family proposal stage
  -> Crux hold proposal scorer
  -> Crux route grouping head
  -> Crux single-route selector
  -> RouteMask v1
```

Deterministic `generateRouteMask` remains useful for benchmarks, debugging, and
regression comparisons, but it is no longer the target product path for no-tap
masking.

## Current Repo Baseline

- App runtime still calls deterministic `@crux/vision` masking from web and
  mobile mask helpers.
- A packaged local YOLO model exists under `.models/vision/crux-route-mask-model`
  and validates with `validate-model-card.py`.
- Existing ML scripts can run tiled instance segmentation, color grouping, route
  selection, single-image QA, and batch comparison.
- SAM3 exists only as a local proposal/teacher script. It is not currently a
  runtime dependency.
- `route_masks` previously only allowed deterministic/manual method strings and
  did not have first-class route-mask metadata storage.

## Runtime Contract

The runtime output must be a `ComboRouteMaskResult` from `@crux/vision`:

- `proposals`: SAM-family mask proposals with geometry, color, area, bbox, and
  primitive score.
- `scoredProposals`: Crux semantic scores such as `isHold`, `routeRelevance`,
  `quality`, optional route embedding, and optional color family.
- `routeCandidates`: grouped accepted holds with selector features.
- `selectedRouteCandidateId`: the single no-tap default route.
- `metadata`: stable persisted metadata with model family/hash, proposal counts,
  route candidate counts, selected candidate id, and runtime timing.

`@crux/vision` owns the TypeScript contract and pure scoring helpers. It must not
import SAM, ONNX Runtime, Expo, React, DOM APIs, or Python bindings.

## Implementation Slices

### Slice 1: Contracts and Persistence

Status: started.

- Add `ComboRouteMaskResult`, `SamMaskProposal`, `ScoredHoldProposal`,
  `RouteCandidate`, and `ComboRouteMaskMetadata` types.
- Allow route-mask methods `ml-yolo26-seg` and `ml-combo-v1`.
- Add `route_masks.metadata_json` in Supabase and mobile SQLite.
- Preserve metadata through mobile sync and web mask-version writes.
- Add targeted tests for the new contracts and schemas.

### Slice 2: Local Combo Runner

Add `scripts/vision-ml/infer-combo-route.py`.

Inputs:

- photo path
- combo model card path
- device/runtime flags
- optional seed point for QA

Stages:

1. Run SAM-family proposal generation.
2. Extract proposal features: mask geometry, bbox, area, crop, color stats, edge
   confidence, position, and neighboring proposal context.
3. Run Crux hold proposal scorer.
4. Group accepted holds into route candidates.
5. Select one default route.
6. Write selected mask, all accepted holds mask, candidate masks/overlays, and
   `report.json`.

The output should mirror `infer-yolo-route.py` enough that existing comparison
scripts can be adapted with minimal churn.

### Slice 3: Proposal Dataset Builder

Add `scripts/vision-ml/build-sam-proposal-dataset.py`.

Responsibilities:

- Run SAM-family proposals on manually annotated images.
- Match proposals to manual hold polygons by IoU.
- Label proposals as `hold`, `non-hold`, and optionally `volume/feature`.
- Generate pairwise/grouping labels from route ids.
- Keep SAM-reviewed or pseudo labels train-only.
- Keep validation/test labels manual-only.

Required outputs:

- proposal rows JSONL
- train/val/test split summary
- leakage audit
- class balance summary

### Slice 4: Crux Heads

Train and export separate Crux heads before app integration:

- Hold proposal classifier: `is_hold`, `route_relevance`, `quality`.
- Route grouping head: route embedding or same-route score.
- Single-route selector: ranks route candidates for the no-tap default.

The selector must beat the current local baseline on batch selected-route IoU,
not just improve top candidate availability.

### Slice 5: Model Card v2

Extend the model-card schema for multi-stage combo inference:

- segmentation primitive and hash/config
- hold proposal scorer hash/config
- grouping/selector hash/config
- thresholds
- proposal recall
- hold F1
- route candidate recall
- selected-route IoU
- p90 runtime on target hardware
- license/distribution notes

Update `validate-model-card.py`, `package-model.py`, and `check-pipeline.py`.

### Slice 6: Product Integration

Only integrate after gates pass:

- Web: dev/QA integration first.
- Mobile: local offline runtime only.
- Save generated mask as `RouteMask v1` with `method='ml-combo-v1'`.
- Store `ComboRouteMaskMetadata` in `route_masks.metadata_json`.
- Brush correction remains `manual-edit` and creates a new mask version.
- Events include method, confidence, and metadata.

## Promotion Gates

Minimum gate set before replacing deterministic no-tap runtime:

- proposal recall measured against manual hold masks
- hold proposal F1 above the packaged YOLO baseline
- route candidate recall: target route appears in top candidates
- selected-route IoU materially above the current batch baseline
- low selection gap between best candidate and selected candidate
- no SAM pseudo-label leakage into validation/test
- p90 runtime acceptable on target mobile hardware
- model-card package validates strictly
- local single-image and batch QA galleries generated

## Commands To Preserve

Current model-card validation:

```bash
.venv-vision-ml/Scripts/python scripts/vision-ml/validate-model-card.py --model-card .models/vision/crux-route-mask-model/model-card.json --strict
```

Current packaged-model batch comparison:

```bash
pnpm tsx scripts/vision/batch-compare-local-masks.ts --manifest .data/vision/heidelberg/manifest.jsonl --model-card .models/vision/crux-route-mask-model/model-card.json --out scripts/output/vision-ml/local-mask-compare-batch --limit 20 --render-max-width 384 --max-det 150 --device cpu
```

Future combo batch comparison should produce the same high-level artifacts:

- `summary.json`
- `rows.jsonl`
- `index.html`
- selected-route overlays
- all-holds overlays
- top route candidate overlays

## Non-Negotiables

- SAM cannot be trusted as the route selector.
- Crux owns hold filtering, grouping, and no-tap route selection.
- Mobile capture must remain offline-first.
- Generated masks are versioned and never overwritten.
- Events remain append-only.
- Validation/test evidence must be manual-label based.
