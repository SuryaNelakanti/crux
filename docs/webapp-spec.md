# Web App Spec (MVP)

## Goals
- Provide a web-first UI for the core capture loop: session -> problem -> mask -> log.
- Use Supabase directly for storage + DB operations (no Expo).
- Mirror the mobile MVP flows so QA can validate end-to-end behavior on web.

## Non-Goals (MVP)
- Full offline-first persistence in the browser (IndexedDB sync queue).
- Advanced analytics or dashboards.
- Collaborative editing beyond shared problem membership.

## Primary Flows
1. Auth (email magic link)
   - Enter email -> receive magic link -> session is created in-app.
2. Session list
   - List recent sessions with counts and status.
   - Start session button.
   - Quick capture: create a new session and upload a photo in one step.
3. Session detail
   - Upload problem photo.
   - List problems with outcome + grade chips.
4. Problem detail
   - View photo with mask overlay toggle.
   - Log outcome, attempts, grade range, note.
   - Edit mask (brush add/erase) and save as a new mask version.

## Routes
- `/` Sessions
- `/session/:sessionId` Session detail
- `/problem/:problemId` Problem detail
- `/problem/:problemId/mask` Mask editor
- `/auth` Login

## Data + Backend Integration
- Supabase is the source of truth.
- Writes are optimistic in UI but always persisted to Supabase tables and storage.
- Media uploads use deterministic storage paths from `@crux/shared`.
- Events are appended for each state change (session started/ended, problem created, media added, route mask created/updated, log upserted).

## Media Pipeline (Web)
1. User uploads a photo file.
2. Create problem row and membership first (RLS-safe).
3. Upload photo to storage bucket.
4. Create media row and update problem primary_media_id.
5. Generate mask in browser using `@crux/vision` (canvas pixel read).
6. Upload mask PNG to storage bucket.
7. Create route mask version row + mask media row.

## Mask Editing (Web)
- Canvas-based overlay with a Select route vs Edit mask mode toggle in the header.
- Auto-outline all holds (color clustering + components) with outline-only rendering.
- Tap a hold to auto-select the full route (same color cluster).
- Brush add/erase for quick corrections (first-class edit mode).
- Editor aligns overlay using contain mapping so saved masks match preview.
- Save writes a new mask version and uploads PNG.

## UI System
- Custom CSS variables for color, spacing, radius, and motion.
- High-contrast, premium aesthetic with subtle gradients and hand-drawn accents.
- Motion: page reveal, list stagger, hover depth (CSS keyframes).

## Environment
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## QA Signal
- A documented repro path in `docs/repro.md` for web.

## 2026-07-24 Flow Update

The web MVP is centered on **Log a climb** rather than a session dashboard. From Home, Log a climb reuses an active session when one exists or starts a new session, opens capture, uploads the photo, generates the automatic heuristic route mask, and lands on the captured-photo outcome screen. Flash, Sent, or Tried save immediately through the append-only event path and return to the active session. There is no default outcome and no separate Save step for the core flow.

Mask correction is named **Fix route** and is progressively disclosed by low confidence or explicit user request. Attempts, grade, and notes are optional details below the outcome controls.
