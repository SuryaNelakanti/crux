# AGENTS.md

Repository-level instructions for automated coding tools working in this codebase.

---

## Product invariant (do not violate)
This is an indoor bouldering journal optimized for photo -> auto-route-mask -> a few taps -> saved.

MVP is data capture, not analytics UI:
- Capture sessions, problems, per-user outcomes, optional attempts, optional grade ranges.
- Generate and version a route mask from the photo (default: auto-dominant hold color, no user tap).
- Allow fast mask correction (brush add/remove) as a new mask version.
- Support shared problem cards (multiple users log on the same problem).
- Work offline-first with reliable sync (mobile requirement).
- Persist append-only events so year-end recap is purely aggregation later.

For product context, see `docs/PRD.md` and `docs/webapp-spec.md`.

---

## Stack decisions

### Web app (primary for MVP testing)
- React + Vite + TypeScript
- Styling: CSS variables + global styles in `webapp/src/styles/global.css`
- UI building blocks live in `webapp/src/components`
- Data access: Supabase via `@crux/supabase-client`
- Mask generation: `@crux/vision` (pure functions), Canvas for mask editor

### Mobile
- React Native via Expo + TypeScript
- Navigation: expo-router (file-based routing)
- Theming: @shopify/restyle (theme-driven, type-safe)
- Animation: react-native-reanimated (physics-based motion)
- Drawing/overlays/mask editor: @shopify/react-native-skia
- Local persistence: SQLite (expo-sqlite)
- Haptics: expo-haptics
- Background sync: in-app worker loop (no external job runner required for MVP)

### Backend
- Supabase: Auth + Postgres + Storage + RLS
- Prefer DB constraints + RLS over app-layer trust

If the repo does not match these choices, align it to this baseline rather than mixing frameworks.

---

## Repository structure

```
crux-journal/
|-- backend/
|   `-- supabase/               # Migrations + edge functions
|-- mobapp/                     # Expo React Native app
|   |-- app/                    # expo-router routes
|   |-- src/
|   |   |-- features/           # Feature modules (session, problem, share, mask)
|   |   |-- components/         # App-specific components (if any)
|   |   |-- hooks/              # App-specific hooks
|   |   `-- lib/                # App-only helpers (permissions, etc.)
|   `-- assets/                 # Fonts, images
|-- webapp/                     # Web-only frontend (React + Vite)
|   |-- src/
|   |   |-- routes/             # Page routes
|   |   |-- components/         # UI components
|   |   |-- lib/                # Supabase + mask helpers
|   |   `-- styles/             # Global CSS + tokens
|   `-- index.html
|-- packages/
|   |-- theme/                  # Design tokens + motion system (no components)
|   |-- ui/                     # Reusable UI components (mobile)
|   |-- shared/                 # Domain types, schemas, constants, utils
|   |-- supabase-client/        # Typed Supabase client + storage helpers
|   `-- vision/                 # Mask generation + image processing (pure funcs)
`-- docs/
    |-- PRD.md
    |-- webapp-spec.md
    |-- decisions.md
    `-- design-quality.md
```

### Package responsibilities

| Package | Purpose | Rules |
|---------|---------|-------|
| `@crux/theme` | Design tokens only | No React components. Exports tokens, themes, motion. |
| `@crux/ui` | Component library (mobile) | Built on theme + Reanimated. Mobile screens use these. |
| `@crux/shared` | Domain logic | No React, no Expo. Pure types, schemas, utils. |
| `@crux/supabase-client` | API boundary | Only DB/storage operations. No UI logic. |
| `@crux/vision` | Image processing | Pure functions. Unit-testable with fixtures. |

---

## Design system (CRED-level quality)

### Mobile design rules
1. All tokens in `packages/theme` (spacing, typography, colors, elevation, motion).
2. Semantic colors only: use `textPrimary`, `bgSurface`, etc. Never raw hex in screens.
3. Components from `@crux/ui`: screens import `Box`, `Text`, `Button`, etc.
4. No `StyleSheet.create` in screens. Use component props.
5. Text variants only. Never set raw `fontSize`.

### Web app UI rules
1. Use CSS variables from `webapp/src/styles/global.css` for colors, spacing, shadows.
2. Keep font choices in `webapp/index.html` unless intentionally changing the brand.
3. Prefer `webapp/src/components` primitives for buttons, inputs, cards, badges, chips.
4. Motion: prefer keyframes defined in `webapp/src/styles/global.css`, avoid ad hoc inline animation.

### Motion rules (mobile)
1. Tokenized durations: use `durations.fast`, `durations.normal`, etc. Never raw `200`.
2. Tokenized easing: use `easing.emphasizedDecelerate`, etc. Never raw bezier curves.
3. Spring-based interactions: press animations use `springs.snappy`, not timed animations.
4. Haptics on interactions: buttons and toggles trigger appropriate haptic feedback.

### Design review
Mobile: use the `/design-system` route (`mobapp/app/design-system.tsx`) to review typography, colors, buttons, cards, inputs, badges, skeleton loaders, and motion demos.  
Web: review Sessions, Session Detail, Problem Detail, and Mask Editor flows in the web app.

See `docs/design-quality.md` for the full checklist.

---

## Import boundaries (target)

Allowed:
- mobapp -> packages/*
- webapp -> packages/*
- packages/ui -> packages/theme
- packages/supabase-client -> packages/shared

Forbidden:
- mobapp -> webapp
- webapp -> mobapp
- packages/shared -> mobapp or webapp
- packages/vision -> expo/* or DOM APIs

---

## Commands

### Root workspace
- Install: `pnpm install`
- Lint (Biome): `pnpm lint`
- Format: `pnpm format`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Config: `biome.json`

### Web app
- Setup env: copy `webapp/.env.example` to `webapp/.env`
- Dev: `pnpm dev` or `pnpm -C webapp dev`
- Build: `pnpm -C webapp build`
- Preview: `pnpm -C webapp preview`
- Typecheck: `pnpm -C webapp typecheck`

### Mobile app
- Dev: `pnpm dev:mobile` or `pnpm -C mobapp start`
- iOS: `pnpm ios`
- Android: `pnpm android`

Quick run:
- Web: `pnpm dev`
- Mobile: `pnpm dev:mobile`

### Supabase
- Start local: `pnpm supabase:start`
- Stop: `pnpm supabase:stop`
- Reset: `pnpm supabase:reset`
- Generate types: `pnpm supabase:types`

### Vision benchmark
- Annotate more Heidelberg holds locally: open `scripts/vision/annotate-heidelberg.html` in Chrome/Edge and select `.data/raw/heidelberg`; it writes `.data/raw/heidelberg/manual-annotation.json`
- Import Heidelberg dataset: `pnpm tsx scripts/vision/import-heidelberg.ts --source .data/raw/heidelberg --out .data/vision/heidelberg`
- Benchmark route masks: `pnpm tsx scripts/vision/benchmark.ts --manifest .data/vision/heidelberg/manifest.jsonl --out scripts/output/vision-benchmark --max-width 1024`
- Render benchmark gallery: `pnpm tsx scripts/vision/render-gallery.ts --metrics scripts/output/vision-benchmark/metrics.jsonl --out scripts/output/vision-benchmark/gallery`
- Compare deterministic vs packaged local model on one photo: `pnpm tsx scripts/vision/compare-local-masks.ts --image path/to/photo.jpg --model-card .models/vision/crux-route-mask-model/model-card.json --out scripts/output/vision-ml/local-mask-compare --render-max-width 384 --top-groups 5 --max-det 150 --device cpu`
- Batch compare deterministic vs packaged local model: `pnpm tsx scripts/vision/batch-compare-local-masks.ts --manifest .data/vision/heidelberg/manifest.jsonl --model-card .models/vision/crux-route-mask-model/model-card.json --out scripts/output/vision-ml/local-mask-compare-batch --limit 20 --render-max-width 384 --top-groups 5 --max-det 150 --device cpu`
- Tune route group scoring from a batch compare report: `pnpm tsx scripts/vision/tune-route-group-scoring.ts --rows scripts/output/vision-ml/local-mask-compare-batch/rows.jsonl --out scripts/output/vision-ml/route-group-score-tuning`

### Vision ML
- Create ML venv: `python -m venv .venv-vision-ml`
- Install CUDA ML deps: `.venv-vision-ml/Scripts/python -m pip install --upgrade pip setuptools wheel && .venv-vision-ml/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128 && .venv-vision-ml/Scripts/python -m pip install -r scripts/vision-ml/requirements.txt`
- Report ML environment: `.venv-vision-ml/Scripts/python scripts/vision-ml/report-environment.py --out scripts/output/vision-ml/environment.json`
- Smoke ML pipeline wiring: `.venv-vision-ml/Scripts/python scripts/vision-ml/smoke-pipeline.py`
- Smoke real YOLO training: `.venv-vision-ml/Scripts/python scripts/vision-ml/train-smoke-yolo.py --model yolo26n-seg.pt --epochs 1 --imgsz 96`
- Run full local ML pipeline after explicit training approval: `.venv-vision-ml/Scripts/python scripts/vision-ml/run-local-pipeline.py --skip-download --raw-source .data/raw/heidelberg --confirm-training`
- Run reviewed SAM3-distilled tiled pipeline after explicit training approval: `.venv-vision-ml/Scripts/python scripts/vision-ml/run-local-pipeline.py --skip-download --raw-source .data/raw/heidelberg --tiled --augmented-manifest .data/vision/heidelberg-sam3-train/manifest.jsonl --augmented-yolo-tiles .data/vision/heidelberg-sam3-yolo-tiles --train-tile-size 1024 --train-overlap 384 --tile-size 1536 --overlap 256 --confirm-training`
- Download Heidelberg dataset with Kaggle credentials: `.venv-vision-ml/Scripts/python scripts/vision-ml/download-heidelberg.py --out .data/raw/heidelberg`
- Generate SAM3-assisted review proposals locally: `.venv-vision-ml/Scripts/python scripts/vision-ml/propose-sam3-labels.py --raw-source .data/raw/heidelberg --manifest .data/vision/heidelberg/manifest.jsonl --model .models/vision/teachers/sam3.pt --text "climbing hold" --out scripts/output/vision-ml/sam3-proposals --limit 120 --preview`
- Generate SAM2 bbox-refined train proposals locally: `.venv-vision-ml/Scripts/python scripts/vision-ml/propose-sam2-labels.py --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --model .models/vision/teachers/sam2.1_t.pt --out scripts/output/vision-ml/sam2-proposals --device 0 --splits train --batch-size 32 --preview`
- Merge reviewed SAM3 proposals into train-only augmented manifest: `.venv-vision-ml/Scripts/python scripts/vision-ml/merge-reviewed-proposals.py --base-manifest .data/vision/heidelberg/manifest.jsonl --reviewed scripts/output/vision-ml/sam3-proposals/reviewed.via.json --out .data/vision/heidelberg-sam3-train/manifest.jsonl`
- Merge SAM2 refined proposals into train-only augmented manifest: `.venv-vision-ml/Scripts/python scripts/vision-ml/merge-reviewed-proposals.py --base-manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --reviewed scripts/output/vision-ml/sam2-proposals/proposals.json --out .data/vision/heidelberg-sam2-train/manifest.jsonl --preserve-base-splits --pseudo-prefix sam2 --pseudo-source reviewed-sam2 --pseudo-route-id sam2_pseudo`
- Validate SAM3 augmented manifest split safety: `.venv-vision-ml/Scripts/python scripts/vision-ml/validate-augmented-manifest.py --manifest .data/vision/heidelberg-sam3-train/manifest.jsonl --strict`
- Validate ML dataset manifest: `.venv-vision-ml/Scripts/python scripts/vision-ml/validate-dataset.py --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --min-images 23 --min-holds 1887 --min-routes 400 --require-splits --strict`
- Prepare YOLO dataset: `.venv-vision-ml/Scripts/python scripts/vision-ml/prepare-yolo-dataset.py --manifest .data/vision/heidelberg/manifest.jsonl --out .data/vision/heidelberg-yolo`
- Prepare SAM3-augmented tiled YOLO dataset without split leakage: `.venv-vision-ml/Scripts/python scripts/vision-ml/prepare-yolo-tiles.py --manifest .data/vision/heidelberg-sam3-train/manifest.jsonl --out .data/vision/heidelberg-sam3-yolo-tiles --tile-size 1024 --overlap 384 --preserve-splits`
- Prepare SAM2-augmented tiled YOLO dataset without split leakage: `.venv-vision-ml/Scripts/python scripts/vision-ml/prepare-yolo-tiles.py --manifest .data/vision/heidelberg-sam2-train/manifest.jsonl --out .data/vision/heidelberg-sam2-yolo-tiles --tile-size 1024 --overlap 384 --preserve-splits`
- Preflight training without starting it: `.venv-vision-ml/Scripts/python scripts/vision-ml/preflight-training.py --data .data/vision/heidelberg-yolo/data.yaml --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl`
- Train hold segmentation after explicit approval only: `.venv-vision-ml/Scripts/python scripts/vision-ml/train-yolo-seg.py --data .data/vision/heidelberg-yolo/data.yaml --model yolo26x-seg.pt --imgsz 1024 --epochs 160 --profile accuracy`
- Sweep ML candidates after explicit approval only: `.venv-vision-ml/Scripts/python scripts/vision-ml/sweep-yolo-seg.py --data .data/vision/heidelberg-yolo/data.yaml --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --models yolo26m-seg.pt yolo26l-seg.pt yolo26x-seg.pt --imgsz 1024 --epochs 160 --profile accuracy --export-format onnx`
- Evaluate ML masks: `.venv-vision-ml/Scripts/python scripts/vision-ml/evaluate-yolo-seg.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split val --out scripts/output/vision-ml/eval`
- Render ML eval gallery: `.venv-vision-ml/Scripts/python scripts/vision-ml/render-gallery.py --metrics scripts/output/vision-ml/eval/metrics.jsonl --out scripts/output/vision-ml/eval-gallery`
- Tune ML thresholds: `.venv-vision-ml/Scripts/python scripts/vision-ml/tune-yolo-thresholds.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split val --out scripts/output/vision-ml/threshold-tuning`
- Evaluate stitched tiled masks with runtime controls: `.venv-vision-ml/Scripts/python scripts/vision-ml/evaluate-yolo-tiles.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.onnx --manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --split val --out scripts/output/vision-ml/eval-yolo26s-tiles1536-val-static-onnx-device0-serial-img640 --tile-size 1536 --overlap 256 --imgsz 640 --conf 0.05 --iou 0.75 --device 0 --serial-tiles --max-det 300`
- Export local model: `.venv-vision-ml/Scripts/python scripts/vision-ml/export-yolo-seg.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.pt --format onnx --imgsz 640 --device 0`
- Validate exported model: `.venv-vision-ml/Scripts/python scripts/vision-ml/validate-export.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.onnx --format onnx --strict`
- Package promoted model: `.venv-vision-ml/Scripts/python scripts/vision-ml/package-model.py --model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.onnx --eval-summary scripts/output/vision-ml/eval-yolo26s-tiles1536-val-static-onnx-device0-serial-img640/summary.json --dataset-manifest .data/vision/heidelberg-yolo/crux-manifest.jsonl --out .models/vision/crux-route-mask-model --imgsz 640`
- Validate model card: `.venv-vision-ml/Scripts/python scripts/vision-ml/validate-model-card.py --model-card .models/vision/crux-route-mask-model/model-card.json --strict`
- Infer from packaged model: `.venv-vision-ml/Scripts/python scripts/vision-ml/infer-yolo-route.py --model-card .models/vision/crux-route-mask-model/model-card.json --image path/to/photo.jpg --out scripts/output/vision-ml/infer --imgsz 640 --conf 0.05 --iou 0.75 --tiled --tile-size 1536 --overlap 256 --device 0 --serial-tiles`
- Audit ML readiness: `.venv-vision-ml/Scripts/python scripts/vision-ml/check-pipeline.py --manifest .data/vision/heidelberg/manifest.jsonl --yolo-data .data/vision/heidelberg-yolo-tiles/data.yaml --checkpoint .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.pt --eval-summary scripts/output/vision-ml/eval-yolo26s-tiles1536-val-static-onnx-device0-serial-img640/summary.json --exported-model .models/vision/yolo-hold-seg/heidelberg-yolo26s-tiles1024-b1/weights/best.onnx --model-card .models/vision/crux-route-mask-model/model-card.json --environment-report scripts/output/vision-ml/environment.json --strict`
- Audit SAM3-distilled ML readiness: `.venv-vision-ml/Scripts/python scripts/vision-ml/check-pipeline.py --exported-model .models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.onnx --augmented-manifest .data/vision/heidelberg-sam3-train/manifest.jsonl --strict`
- Build SAM+Crux combo proposal dataset: `.venv-vision-ml/Scripts/python scripts/vision-ml/build-sam-proposal-dataset.py --manifest .data/vision/heidelberg/manifest.jsonl --raw-source .data/raw/heidelberg --model .models/vision/teachers/sam3.pt --out .data/vision/heidelberg-sam3-combo-proposals --preview`
- Train SAM+Crux combo heads: `.venv-vision-ml/Scripts/python scripts/vision-ml/train-combo-heads.py --proposal-rows .data/vision/heidelberg-sam3-combo-proposals/proposals.jsonl --out .models/vision/crux-combo-heads-v1 --device 0`
- Export SAM+Crux combo heads: `.venv-vision-ml/Scripts/python scripts/vision-ml/export-combo-heads.py --checkpoint .models/vision/crux-combo-heads-v1/combo-heads.pt --out .models/vision/crux-combo-heads-v1/onnx`
- Evaluate SAM+Crux combo route masks: `.venv-vision-ml/Scripts/python scripts/vision-ml/evaluate-combo-route.py --proposal-rows .data/vision/heidelberg-sam3-combo-proposals/proposals.jsonl --manifest .data/vision/heidelberg/manifest.jsonl --crux-heads .models/vision/crux-combo-heads-v1/onnx/combo-heads.onnx --split val --out scripts/output/vision-ml/eval-combo-route`
- Package SAM+Crux combo model: `.venv-vision-ml/Scripts/python scripts/vision-ml/package-combo-model.py --crux-heads .models/vision/crux-combo-heads-v1/onnx/combo-heads.onnx --sam-model .models/vision/teachers/sam3.pt --eval-summary scripts/output/vision-ml/eval-combo-route/summary.json --proposal-summary .data/vision/heidelberg-sam3-combo-proposals/summary.json --dataset-manifest .data/vision/heidelberg/manifest.jsonl --out .models/vision/crux-route-mask-combo-v1`
- Infer with SAM+Crux combo model: `.venv-vision-ml/Scripts/python scripts/vision-ml/infer-combo-route.py --image path/to/photo.jpg --model-card .models/vision/crux-route-mask-combo-v1/model-card.json --sam-proposals scripts/output/vision-ml/sam3-proposals/proposals.json --out scripts/output/vision-ml/infer-combo`

Before opening a PR, run lint + typecheck at minimum.

---

## Working rules for changes

### Planning and scope
- Start with a short plan: what you'll change, files involved, and how correctness will be verified.
- Prefer small, composable PRs over broad refactors.
- Do not introduce new libraries unless they remove real complexity.
- Primary testing target is the web app unless otherwise specified.

### Verifiable correctness
- Every feature must have at least one signal that it works:
  - a test, or
  - a deterministic local repro documented in `docs/repro.md`, or
  - a script/command that validates behavior.

### Style and hygiene
- TypeScript `strict: true`. Avoid `any`; if unavoidable, isolate it and explain why.
- Use Biome for linting/formatting. Do not add ESLint or Prettier configs.
- No dead code, no unused dependencies, no "temporary" TODOs without an issue reference.
- Keep UI logic thin; push non-UI logic into shared modules.

---

## Data model (minimum, recap-ready)

### Core entities
- Session: start/end, optional gym label.
- Problem (canonical): created from a photo.
- Membership: problem_members (sharing gate).
- UserProblemLog: per-user per-problem-per-session outcome; optional attempts; optional grade range; optional note.
- RouteMask: versioned mask artifact tied to a problem.
- Media: photo and mask objects in storage.
- Events: append-only event log of all state transitions.

### Event sourcing (required)
All user-visible state changes must emit an event with a UUID idempotency key:
- session_started / session_ended
- problem_created / photo_added
- outcome_set / attempts_set / grade_set / note_set
- route_mask_created / route_mask_updated
- problem_shared / problem_joined

Events should be sufficient to reconstruct:
- what happened in a session,
- who did what on a shared problem,
- how masks evolved.

---

## Offline-first + sync (required pattern)

### Scope
Applies to mobapp (Expo + SQLite). Web app is online-first and may call Supabase directly unless explicitly asked to add offline-first behavior.

### Local-first writes
All user actions write to local SQLite first. Nothing blocks on network.

### Outbox
Maintain:
- outbox_events (append-only, retryable)
- outbox_media (photo/mask uploads, retryable)

### Sync rules
- Upload media first (deterministic storage paths).
- Flush events with idempotency (dedupe by UUID on server).
- Upsert derived entity rows as needed, but events are the source of truth.
- Conflict policy (MVP): last-write-wins for UserProblemLog fields; still emit events for every change.

---

## Route masking (MVP requirement)

### Default behavior
Generate an initial mask automatically without user tap:
- Downscale photo for processing.
- Color cluster (HSV/Lab).
- Select the cluster most consistent with holds (high saturation, non-background, reasonable connected components).
- Clean mask (morphology + small component removal).
- Store as RouteMask v1 with method metadata + confidence.

### Correction
Provide a fast editor:
- Brush add/remove.
- Save creates RouteMask v(n+1) referencing the edited mask media.
- Do not mutate older mask versions.

### Non-goals (MVP)
- Full ML hold detection training.
- Accurate move sequence prediction.
- Perfect grading.

---

## Sharing (required)

- Share link deep-links to a problem_id.
- Access is controlled by problem_members + Supabase RLS.
- Joining creates membership and allows the user to create their own UserProblemLog for that problem.

On the UI, show:
- your log,
- a minimal list of friends' outcomes (no analytics).

---

## Supabase standards

### Migrations
- All schema changes via migrations in `backend/supabase/migrations`.
- Never hot-edit production schema.
- Keep RLS policies explicit and tested by simple access checks.

### Storage
- Separate buckets: photos, masks.
- Use deterministic object keys:
  - photos/<problem_id>/<media_id>.jpg
  - masks/<problem_id>/<mask_id>.png

### RLS (required)
- A user can read a problem if:
  - they created it OR
  - they are a member of it.
- A user can write only their own UserProblemLog rows.
- Events: users write their own events; reads limited to items they can access via membership.

---

## Tests and checks (minimum bar)

### Unit tests (shared logic)
- Mask generation functions (deterministic with fixtures).
- Event schema validation (zod).
- Idempotency: event dedupe keys.

### Integration smoke checks
- Offline capture -> restart app -> still present.
- Later sync -> server reflects correct state.
- Share link join -> second user can log.

If tests are missing, add at least one fixture-based test for the mask pipeline and one for the outbox/event flush.

---

## Review checklist (must satisfy)

- [ ] Lint + typecheck pass.
- [ ] No secrets committed; no keys in repo.
- [ ] RLS remains correct (no broad SELECT/INSERT).
- [ ] Offline-first behavior preserved for mobapp (no blocking network writes in core flows).
- [ ] Events emitted for every state change.
- [ ] Route masks are versioned, never overwritten.
- [ ] Shared problem membership gates access.
- [ ] Mobile UI uses @crux/ui components (no raw StyleSheet in screens).
- [ ] Motion uses tokens (no hardcoded durations).
- [ ] Touch targets >= 44pt.

---

## Documentation expectations

When behavior or schema changes:
- Update `docs/PRD.md` only if product intent changes.
- Add/append a short note in `docs/decisions.md` describing the decision and why.
- If a new command is required, document it in this file under Commands.
- Review `docs/design-quality.md` for UI changes.
- Update `docs/webapp-spec.md` for web flow or UI changes.
