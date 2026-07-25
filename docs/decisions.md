# Architecture Decision Records

Documenting key architectural decisions for Crux.

---

## ADR-001: Monorepo with pnpm Workspaces

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
Crux needs to share code between the mobile app and potentially future platforms (web, backend functions). We need clear separation of concerns between UI, domain logic, and infrastructure.

**Decision:**
Use pnpm workspaces with a monorepo structure:
- `mobapp` - Expo React Native app
- `packages/theme` - Design tokens and motion system
- `packages/ui` - Reusable UI components
- `packages/shared` - Domain types, schemas, utilities
- `packages/supabase-client` - Typed database/storage API
- `packages/vision` - Image processing and mask generation

**Consequences:**
- Clear boundaries between packages
- Code sharing is explicit through dependencies
- Types are shared without duplication
- Slightly more complex setup than single-package

---

## ADR-002: Shopify Restyle for Theming

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
Need a theming system that:
- Supports runtime theme switching
- Enforces design system usage
- Provides strong TypeScript types
- Works well with React Native

**Decision:**
Use `@shopify/restyle` for theme-driven styling.

**Consequences:**
- All styling goes through theme tokens
- TypeScript enforces valid token usage
- Runtime theme switching is built-in
- Slightly higher learning curve than raw StyleSheet

---

## ADR-003: React Native Reanimated for Motion

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
CRED-level design requires consistent, premium motion throughout the app. Animations need to be:
- Smooth (60fps)
- Interruptible
- Physics-based where appropriate

**Decision:**
Use `react-native-reanimated` for all animations. Motion is tokenized in `packages/theme/src/motion/`.

**Consequences:**
- All components can have smooth animations
- Motion tokens ensure consistency
- Requires Reanimated babel plugin
- Slightly more complex than Animated API

---

## ADR-004: Motion Tokens as First-Class Primitive

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
Premium apps (CRED, Apple apps) feel polished because motion is consistent. Random durations/easings make apps feel janky.

**Decision:**
Motion is tokenized alongside colors and spacing:
- `durations` - Named timing buckets (fast, normal, slow)
- `easing` - Named bezier curves (emphasizedDecelerate, bounce)
- `springs` - Physics configs (snappy, bouncy, soft)
- `patterns` - Choreography recipes (buttonPress, screenEnter)
- `haptics` - Vibration patterns (light, success, error)

Screens cannot hardcode durations or easing curves.

**Consequences:**
- Consistent motion feel throughout app
- Easy to tune globally
- Designers can review motion in playground
- Requires discipline to use tokens

---

## ADR-005: Import Boundaries via ESLint

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
Design systems break down when screens bypass components and use raw styles. Need to enforce:
- Screens use `@crux/ui` components
- Screens don't import raw colors
- Screens don't use `StyleSheet.create`

**Decision:**
Configure ESLint with `no-restricted-imports` rules:
- Ban `StyleSheet` import in screen files
- Ban `tokens/colors` import in screen files

**Consequences:**
- Style drift is caught at lint time
- Components remain the single source of styling
- Occasionally need to disable for edge cases

---

## ADR-006: Design Playground for Review

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
Designers can't review code. They need a visual surface to verify:
- Typography scales correctly
- Colors meet contrast requirements
- Components look correct in all states
- Motion feels right

**Decision:**
Create `/design-system` route that displays:
- All typography variants
- Semantic color swatches
- Buttons in all variants × states
- Cards, inputs, badges, etc.
- Skeleton loaders
- Theme toggle

**Consequences:**
- Designers have a systematic review surface
- Changes are immediately visible
- Serves as living documentation

---

## ADR-007: Core schema + local-first outbox sync

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
MVP requires offline-first logging with reliable sync, plus strong access control for shared problems.
We also need explicit schema + RLS to enforce ownership and membership.

**Decision:**
Add a full Supabase schema (sessions, problems, media, masks, logs, events) with RLS policies and share-link RPCs.
Mirror the schema locally in SQLite with outbox tables for events/media and a sync worker that flushes uploads,
upserts rows, and pulls shared problem changes. Camera capture uses Expo Camera with on-device photo processing.

**Consequences:**
- Offline captures are durable and syncable without network
- Access control is enforced at the database level
- Sync logic is explicit and testable, with clear failure states

---

## ADR-008: On-device mask generation + Skia editor

**Date:** 2026-01-17

**Status:** Accepted

**Context:**
MVP requires fast, offline mask generation and quick corrections. We need a
deterministic pipeline that works without ML training and a lightweight editor
for brush add/remove that persists versions.

**Decision:**
Implement a pure HSL clustering pipeline in `@crux/vision` for auto masks.
Use Skia to read pixels on-device, encode mask PNGs, and provide a brush-based
editor that saves new `route_masks` versions.

**Consequences:**
- Masking works offline and is deterministic across devices
- Edits create new versions without mutating prior masks
- No server dependency for initial mask generation

---

## ADR-009: Separate webapp, mobapp, backend folders

**Date:** 2026-01-18

**Status:** Accepted

**Context:**
Testing will focus on a web UI while the mobile app continues to evolve. We need
clear separation between backend (Supabase), the web frontend, and the mobile
frontend so each can be worked on independently.

**Decision:**
Introduce top-level folders for:
- `backend/` (Supabase migrations + functions)
- `webapp/` (React + Vite web-only UI)
- `mobapp/` (Expo React Native app)

**Consequences:**
- Easier parallel development and CI targeting per surface
- Web app can be iterated quickly without Expo web constraints
- Workspace scripts and documentation must reference the new paths

---

## ADR-010: Seed-color re-mask in web editor + stronger mask visibility

**Date:** 2026-01-18

**Status:** Superseded (see ADR-013)

**Context:**
Auto mask works for most photos, but when hold color is off, users had no quick
way to re-run the mask without brushing everything. The mask overlay was also
too subtle to read on the photo.

**Decision:**
Remove the pick-color re-mask UI in favor of tap-to-route hold selection. Keep
seeded masking logic available for future use, while improving overlay visibility
with a stronger tint and normal blend mode.

**Consequences:**
- Users can re-mask quickly without full manual edits
- Saved mask versions capture whether they were auto/seed/manual
- Overlay readability improves across photo lighting conditions

---

## ADR-011: Contain-aware mask editing + seeded clustering

**Date:** 2026-01-18

**Status:** Accepted

**Context:**
Mask edits were drifting when viewed later because the editor used object-fit cover
without mapping pointer coordinates to the cropped region. Seeded masks also felt
inconsistent when the selected color didn't align with cluster centers.

**Decision:**
Render the editor overlay with a contain transform so the full photo is visible,
and map pointer coordinates through the same transform. When a seed color is
provided, still compute clusters and choose the nearest cluster center, with
adaptive thresholds and smaller component filtering for better hold capture.

**Consequences:**
- Edits align with the preview and saved mask positions without cropping
- Seeded masks are more stable on real photos
- Slightly more CPU during mask generation and redraw

---

## ADR-012: Seeded LAB region-grow for pastel holds

**Date:** 2026-01-18

**Status:** Accepted

**Context:**
Pastel holds (pink/yellow) were difficult to capture with HSL-only thresholds.
Users saw masks collapse or drift to nearby wall colors even with seed selection.

**Decision:**
When a seed point is provided, compute LAB distance from the sampled seed pixel
and grow the mask regionally from the seed. Use adaptive thresholds by hue/
lightness, a low-saturation wall guard, and a coverage sanity retry.

**Consequences:**
- Seeded masks better lock onto pastel holds
- Color selection is more robust with minor lighting changes
- Slightly higher CPU cost during seeded masking

---

## ADR-013: Hold outline + tap-to-route (non-ML MVP)

**Date:** 2026-01-18

**Status:** Accepted

**Context:**
Users expect the mask editor to outline all holds and allow a single tap to
select the full route (all holds of the same color). ML solutions are heavier
than needed for the MVP.

**Decision:**
Implement a non-ML hold detection pipeline (color clustering + connected
components) that outlines all holds with outline-only rendering for clarity.
Tapping a hold selects the route by color cluster and generates the route mask
for saving; brush edits remain available for corrections.

**Consequences:**
- Faster UX for route selection without manual brushing
- Deterministic, offline-friendly pipeline
- Some false positives in noisy images (acceptable for MVP)

---

## ADR-014: Atlas Design System with Organic Doodles

**Date:** 2026-01-18

**Status:** Accepted

**Context:**
The initial UI feedback highlighted a need for a more premium, structured aesthetic ("Atlas") combined with a "human journal" feel.
Standard clean UIs felt too generic, while heavy gamified designs felt childish.

**Decision:**
Adopt the "Atlas" design language:
- **Warm Technical Base**: Sand/Stone backgrounds, Sage/Teal accents (No Orange/Blue primary).
- **Typography:** `Playfair Display` (Serif) for headers + `Space Mono` for data.
- **Layout:** Grid-based technical layouts with corner brackets, crosshairs, and data-dense headers.
- **Organic Layer:** Overlay distinct hand-drawn SVG doodles (spirals, stars, scribbles) that animate in ("draw themselves") to humanize the technical grid.

**Consequences:**
- Distinctive, premium "Field Lab" brand identity
- Clear separation between structure (Grid) and human input (Doodles)
- Requires maintenance of dual-layer visual system (Tech + Organic)
- Typography choices (Serif + Mono) require careful font loading

---

## ADR-015: Contrast-Based Hold Detection containing Vector Doodles

**Date:** 2026-01-19

**Status:** Accepted

**Context:**
The previous K-means clustering approach for hold detection often failed on multi-colored walls or when lighting varied significantly. Users found it difficult to get accurate masks without manual brushing. Additionally, the visualization of detected holds was unclear.

**Decision:**
1.  **Contrast-Based Detection:** Switch to a "wall subtraction" algorithm. Detect the dominant wall color (or use a user-sampled color) and identify holds as regions with significant LAB color distance from the wall.
2.  **Vector Doodle Visualization:** Render *all* detected holds as "white vector doodles" (white fill, black stroke) to provide a clear, aesthetic overlay that looks like a sketched guide.
3.  **Wall Picker Tool:** Add a specific tool for users to sample the wall color, which feeds into the detection algorithm to handle complex wall textures.
4.  **Legacy Polyfill:** Enrich the new detection results with computed cluster indices to maintain compatibility with existing stats and auto-masking APIs that expect K-means clusters.

**Consequences:**
- Signifcant improvement in detection accuracy on complex walls
- "White Doodle" aesthetic aligns with the Atlas/Journal design language
- Users have more control via the Wall Picker
- Backend API remains stable despite the detection engine swap

---

## ADR-016: Camera-first workflow migration

**Date:** 2026-05-11

**Status:** Accepted

**Context:**
The MVP invariant is photo -> auto-mask -> a few taps -> saved. The UI had
started to expose journal, mask, and decorative brand elements with similar
weight, which made the fastest capture path feel less direct.

**Decision:**
Reframe the mobile app around a camera-first workflow:
- Sessions is a quiet launcher with active-session resume first.
- Active Session is the cockpit: capture action, session counts, problem feed.
- Camera is a focused capture tunnel with minimal chrome.
- Problem detail is outcome-first: photo/mask, "what happened?", optional fields.
- Mask Editor is a focused correction tool that saves new mask versions.

The design direction is "Field Lab": restrained, photo-dominant, warm technical,
and task-first. Organic doodles are reduced on core workflow screens so they do
not compete with the wall photo or primary actions.

**Consequences:**
- The happy path is clearer: add problem, capture, tap outcome, save.
- Secondary actions remain available without competing with capture.
- Sharing, export, and settings can land as artifact/system actions instead of
  interrupting the capture tunnel.

---

## ADR-017: Dataset-driven vision benchmark

**Date:** 2026-05-11

**Status:** Accepted

**Context:**
Synthetic mask tests were not enough to improve real gym photo quality. The app
needs repeatable benchmark metrics against annotated indoor climbing imagery
before further detector tuning can be trusted.

**Decision:**
Use the Heidelberg/Kaggle indoor climbing hold and route segmentation dataset as
the primary local benchmark. Keep raw data and generated outputs ignored. Add
pure vision APIs for route grouping and mask generation, plus local scripts to
import VIA annotations, benchmark the detector, and render visual QA galleries.

**Consequences:**
- Detection changes can be evaluated with IoU, recall, component recall, route
  grouping quality, and runtime.
- Runtime app code uses the same `generateRouteMask` API as the benchmark.
- No ML model is added to the app in this phase.

---

## ADR-018: Opt-in local ML route mask pipeline

**Date:** 2026-05-12

**Status:** Accepted

**Context:**
The deterministic detector is now benchmarkable, but world-class route masks
need a trained local model for difficult lighting, low-contrast holds, and dense
route overlap. The mobile product invariant still requires offline capture and
must not depend on a server-side model.

**Decision:**
Add an opt-in Python ML pipeline that trains a YOLO segmentation model on the
normalized Heidelberg manifest. The model predicts individual hold instances;
Crux post-processing groups predicted holds into route candidates by color.
Keep raw data, training runs, and exported models ignored under `.data/` and
`.models/`. Do not make ML the production default until validation gates and
local runtime constraints are satisfied.

**Consequences:**
- Training, evaluation, export, and single-image QA are reproducible locally.
- The app can adopt a local model later without losing the deterministic
  fallback or offline-first behavior.
- The project must review model/framework/dataset licenses before shipping
  trained weights.

---

## ADR-019: Tiled ML training stays local until all gates pass

**Date:** 2026-05-13

**Status:** Accepted

**Context:**
Full-frame YOLO segmentation under-detected small holds in Heidelberg photos.
Tiling preserves hold scale and improved recall, but tiled inference is slower
and no-tap route selection is still not reliable on every held-out wall style.

**Decision:**
Add local-only tiled dataset preparation and stitched evaluation scripts for the
ML route-mask pipeline. Keep the package/model-card step blocked unless the same
checkpoint clears all quality and runtime gates. Adjust the no-tap color-route
selector to penalize bright wall-like groups when choosing the default dominant
hold color.

**Consequences:**
- The training pipeline can test small-hold recall without changing app
  behavior.
- Current tile-trained checkpoints remain unpromoted because held-out
  evaluation still fails the runtime gate.
- A future promoted model needs a faster exported tiled runtime; more labels can
  still improve generalization across wall styles.
- 2026-05-19 runtime follow-up: a `tiles1900-img768` fine-tune reached the
  runtime gate on validation but failed all-hold recall, while batched and FP16
  tiled inference kept quality but made p90 runtime worse on the RTX 3060 laptop
  GPU. These controls remain available for reproducible experiments, but they
  are not promotion evidence.
- 2026-05-19 data follow-up: SAM3 can be used as an offline teacher to propose
  hold masks for manual review and student distillation. SAM3 outputs are not
  accepted as validation/test ground truth, and SAM3 is not added to app runtime.

---

## ADR-020: Local mask comparison drives route selection tuning

**Date:** 2026-05-24

**Status:** Accepted

**Context:**
The packaged model-card inference can segment many holds, but default no-tap
route selection is still the main visible failure on local photo comparisons.
Manual one-off screenshots are not enough to improve it safely.

**Decision:**
Keep the comparison workflow local-only and compare deterministic
`generateRouteMask` output against packaged model-card inference on the same
photo or manifest row. Record top model route groups with their scoring feature
vectors so the route selector can be tuned against known masks without changing
runtime app behavior. SAM-family models may be used locally as an edge teacher
or proposal source for reviewed labels, but Crux's model remains responsible for
hold detection, route grouping, and route selection.

**Consequences:**
- Route selection changes must be backed by batch metrics and comparable
  overlays, not by isolated visual inspection.
- SAM output can improve edge quality through reviewed labels or distillation
  without becoming the product fallback.
- The app remains offline-first and does not gain a runtime SAM dependency.

## 2026-07-24: Session Film MVP capture loop

Approved MVP behavior is now the three-action Session Film loop:

1. **Log a climb** creates or reuses the active session and opens camera/photo capture.
2. The captured photo immediately starts the existing heuristic route-mask pipeline and shows a quiet mask overlay on the photo.
3. Tapping **Flash**, **Sent**, or **Tried** writes the log immediately and returns control to the active session.

There is no separate Save step and no default outcome. Attempts, grade, notes, sharing, session controls, and mask correction remain progressively disclosed. The primary route detail affordance is **Fix route**, shown when mask confidence is low or when the user opens more details.

---

## ADR-021: Camera-first consumer web interface

**Date:** 2026-07-25

**Status:** Accepted

**Context:**
The first restrained web redesign still read as a SaaS session dashboard. Crux is used by younger climbers with one hand in a dim gym, and its main job is capturing a route memory before the next attempt. Dashboard composition, management cards, decorative doodles, and oversized marketing copy all delayed that job.

**Decision:**
Use shadcn/ui Nova components with scoped Radix primitives, Lucide icons, Geist typography, Tailwind CSS v4, and semantic OKLCH tokens. Compose the product as a camera-first consumer app:

- Home is **Tonight**, led by the active session film.
- Capture stays in a persistent bottom dock within thumb reach.
- Finished sessions move into the secondary **Journal**.
- Problem detail remains photo-first and saves outcomes immediately.
- Mask correction remains a focused full-height workflow.
- Generated imagery, gradients, glass effects, random doodles, and analytics-style metric cards are excluded.

**Consequences:**
- The route photo and next action carry the hierarchy.
- Desktop and mobile share one consumer interaction model instead of diverging into a dashboard.
- Standard component states and accessibility behavior come from shadcn/Radix.
- Web bundle imports use scoped Radix packages rather than the full barrel.

---

## ADR-022: Tonight and Journal are separate destinations

**Date:** 2026-07-25

**Status:** Accepted

**Context:**
The bottom dock named Tonight and Journal, but both controls resolved to sections of the same page. The labels implied distinct destinations and made the navigation feel unfinished.

**Decision:**
Give each label one clear responsibility:

- `/tonight` contains only the live session, route film, and next capture.
- `/journal` contains only finished sessions, grouped chronologically.
- `/` redirects to `/tonight`.
- Capture remains available from both destinations and reuses or starts the active session.
- The dock shows the current destination visually and through `aria-current`.

**Consequences:**
- Active climbing and past sessions no longer compete on one screen.
- The navigation matches the user's mental model and browser history.
- Session detail returns to Tonight for live sessions and Journal for finished sessions.
