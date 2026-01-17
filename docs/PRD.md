# PRD: Indoor Bouldering Journal (Photo → Problem Card → Log)

**Scope:** indoor bouldering only, no gym partnerships.
**Core UX:** take photo → app auto-masks route (dominant hold color) → user logs outcome (+ optional attempts/grade) → save.
**Design constraint:** capture primitives now so year-end recap is a pure aggregation later.

## Product definition

A photo-first bouldering journal that lets you log a problem in ≤ 15 seconds, works offline, and supports sharing a “problem card” so friends can log against the same problem—without gym integrations.

### Target user

* Regular indoor boulderer who wants a personal log without admin overhead.
* Small friend groups who want to share a problem card and compare outcomes.

### Goals (MVP)

* **Fast capture:** photo + one-tap outcome is the default happy path.
* **Recap-ready data:** store primitives + immutable events so future analytics are pure aggregation.
* **Offline reliability:** sessions are fully usable in airplane mode; sync is idempotent.
* **Lightweight sharing:** a shared problem card supports per-user logs and a minimal “friends’ outcomes” view.

### Non-goals (MVP)

* Outdoor climbing, roped climbing, boards (Moon/Kilter), or gym partnerships/integrations.
* Advanced analytics UI, training plans, leaderboards, or a social feed.
* Full ML hold detection; masking is heuristic + manual correction.

### Success metrics (MVP targets)

* `P50` shutter → saved log ≤ 10s; `P90` ≤ 15s.
* `P50` time to correct a bad mask ≤ 20s.
* ≥ 80% of logged problems require no mask edit.
* Sync is idempotent; replaying the outbox never duplicates entities/events.

---

## 0) First-principles framing

### What must be true for this to work without gym integrations

1. **Users will only do “photo + tap.”** Anything more becomes “I’ll do it later” → never.
2. **A photo must become a stable problem identity** (at least within a session) so logs attach to something concrete.
3. **Most gyms in your target behave like “one hold color ≈ one problem.”** This is the leverage point for auto-masking without pre-trained hold detectors.
4. **The system must tolerate errors** (mask wrong, grade noisy) while still collecting useful data. Therefore:

   * store model guesses + confidence,
   * store user overrides,
   * store immutable events.

### Key risks (and mitigations)

* **Multiple problems share a hold color:** keep mask editing fast; optionally support a one-tap fallback to set the seed color (tap a hold) when confidence is low.
* **Photos include people/PII:** strip EXIF on import; default problems are private; sharing is explicit; support delete.
* **Duplicate cards across sessions:** treat each capture as a new problem by default; optionally suggest merges using a lightweight fingerprint (e.g., photo perceptual hash + gym_label + seed color) without blocking logging.

### What “MVP” actually means here

Not “analytics UI.”
MVP = **fast logging + correct data capture + sharing + reliable sync + versioned masks**.

---

## 1) User stories (minimal, complete)

### U1: Log a session

* Start a session.
* Add multiple problems with minimal interaction.
* End the session.

### U2: Log a problem in ≤ 15 seconds

* Take photo.
* Auto route mask appears (or asks for a quick “tap a hold” seed color if confidence is low).
* Tap outcome (flash/send/tried/project).
* Optionally set attempts and grade range.
* Save.

### U3: Fix the mask when it’s wrong (rare)

* Enter edit mode.
* Toggle/brush add/remove.
* Save new mask version.

### U4: Shared problem card with friends

* Share a problem.
* Friend opens link, joins, logs their own outcome/attempts/grade on same problem.

### U5: Offline capture

* Everything works without network.
* Sync later is correct and idempotent.

---

## 2) Data principles (what must be stored; why)

### Non-negotiable primitives

* **Session** boundaries (start/end timestamps).
* **Problem** object created from a photo.
* **Per-user log** of outcome (+ optional attempts, optional grade range, optional note).
* **Route mask** (versioned) + method (auto vs edited).
* **Model suggestions** + confidence + raw features sufficient for reprocessing.
* **Events** appended for every state transition.
* **Client-generated IDs** for all offline-created entities (UUIDs) so sync can be pure upsert/replay.

### Practical definition of “problem identity”

* A **problem card** is created at capture time; its primary key is a client-generated UUID.
* The first photo creates the card; additional photos can attach as extra `media` without changing identity.
* Cross-session dedupe is best-effort and optional: suggest “this looks like X” but never force a merge before logging.

### Why events

Year-end recap/trends require temporal truth:

* “First time you sent V4”
* “Crimp-heavy weeks”
* “Projects that lasted 6 sessions”
  This is hard to reconstruct from only final state.

---

## 3) System components (high level)

* **Mobile app** (capture + edit + log + share + offline store).
* **Backend** (auth, DB, storage, RLS).
* **Async enrichment** (optional in MVP): compute refined mask + tags after upload; never blocks logging.

---

## 4) Data model (minimal schema)

### Tables

**users**

* id, handle, created_at

**sessions**

* id, user_id, start_ts, end_ts, gym_label (nullable), created_at

**problems** (canonical object)

* id, created_by, created_at, created_in_session_id (nullable), primary_media_id (nullable initially), photo_phash (nullable)

**problem_members** (sharing)

* problem_id, user_id, role (owner/member), joined_at
* unique(problem_id, user_id)

**problem_share_links** (revocable invite links)

* id, problem_id, created_by, token, created_at, revoked_at (nullable), expires_at (nullable)
* unique(token)

**media**

* id, problem_id, type(photo/mask), storage_path, width, height, created_at, sha256 (nullable), bytes (nullable), metadata_json

**route_masks** (versioned)

* id, problem_id, version, mask_media_id, method(auto/color-dominant/manual-edit), seed_color_json, confidence (nullable), created_by, created_at

**user_problem_logs** (per user per problem per session)

* id, user_id, problem_id, session_id
* outcome enum {flash, send, tried, project}
* attempts_count int nullable
* grade_min int nullable, grade_max int nullable (V-scale stored normalized)
* note text nullable
* created_at
* updated_at
* unique(user_id, problem_id, session_id)

**tag_suggestions** (optional v0)

* id, problem_id, model_version
* tags_json (hold/style), confidence_json, raw_features_json
* created_at

**events** (append-only)

* id (uuid), user_id, session_id nullable, problem_id nullable
* type, payload_json, client_ts, server_ts
* unique(id) (idempotency)

**settings**

* user_id, attempts_mode {off, aggregate, per_attempt}, grade_scale

(If pain logging is included)
**pain_logs**

* session_id, user_id, body_part, score, ts

### Event taxonomy (minimum)

Events represent user intent and must be emitted on the local write path first, then synced. Suggested baseline types:

* `session_started` {session_id}
* `session_ended` {session_id}
* `problem_created` {problem_id, created_in_session_id, primary_media_id}
* `problem_media_added` {problem_id, media_id, type}
* `route_mask_created` {problem_id, route_mask_id, method, confidence}
* `route_mask_updated` {problem_id, route_mask_id, method}
* `user_problem_log_upserted` {user_id, problem_id, session_id, outcome, attempts_count, grade_min, grade_max}
* `problem_share_link_created` {problem_id, share_link_id}
* `problem_joined` {problem_id}

Notes:

* `client_ts` is captured on-device (works offline) and is used for recap ordering.
* `server_ts` is assigned on ingest and is useful for sync watermarks and auditing.

---

## 5) Masking logic (dominant hold color)

### Input

* Problem photo (compressed, normalized).
* No user tap required by default.

### Output

* Initial route mask version 1.

### Method (auto)

1. Downscale image (e.g., max 512px width for processing).
2. Identify “hold-like” pixels **without ML**:

   * heuristic segmentation: high saturation + edges + non-wall texture clusters, OR
   * simply operate on the entire image but constrain to central ROI (pragmatic).
3. Cluster colors (HSV or Lab) into K clusters.
4. Score clusters for “likely holds”:

   * high saturation
   * non-wall hue distribution
   * compact connected components (not giant background)
5. Choose dominant cluster → binary mask.
6. Morphology cleanup (open/close), remove tiny components.
7. If confidence is below threshold, return a “no mask yet” state (UI still allows logging) and optionally prompt for a 1-tap seed color.
8. Store:

   * mask image (PNG) in storage,
   * seed_color stats,
   * method=auto/color-dominant,
   * confidence estimate (based on cluster separation + component stats).

### User correction

* Edit mask mode supports:

  * brush add/remove on mask bitmap
  * undo/redo (optional)
  * save → new route_masks version

---

## 6) UX surfaces (only what MVP needs)

### Screen A: Home

* Start Session
* List recent sessions (title + date + minimal counts if available)

### Screen B: Session Feed

* Big “+ Problem” button
* List problem cards created in this session (thumbnail + your outcome)
* End Session

### Screen C: Problem Detail

* Photo + mask overlay toggle
* Mask state: generated / generating / low-confidence (+ “tap a hold” seed color fallback)
* Quick log controls:

  * outcome
  * attempts (if enabled)
  * grade range (optional)
  * note (optional)
* Mask edit entry
* Share button
* Friends logs (minimal: name + outcome)

No analytics pages in MVP.

---

## 7) Sync and offline behavior

### Offline-first rules

* All writes go to local DB first.
* Media stored locally immediately.
* An outbox queues:

  * media uploads
  * event uploads
  * entity upserts

### Idempotency

* Each event has a UUID; backend ignores duplicates.
* Media uploads keyed by deterministic path: `user/<uid>/problem/<pid>/<media_uuid>.jpg`.
* Entity writes are upserts keyed by client-generated IDs (no server-generated primary keys in the offline write path).

### Conflict policy (MVP)

* `events` are append-only → no conflict.
* `user_problem_logs` last-write-wins per field; store every change as an event anyway.

---

## 8) Access control (RLS constraints)

* A user can read a problem if:

  * they created it, or
  * they are in `problem_members`.
* A user can write their own `user_problem_logs`.
* Only owner can share/invite (writes membership).
* A share link token authorizes membership creation; it should not grant anonymous read access by itself.

---

## 9) Acceptance criteria (MVP quality bar)

* Create a session and log ≥ 20 problems without app slowdown.
* Logging speed: `P90` shutter → saved log ≤ 15s on a mid-range device.
* Offline: log problems + edit masks; later sync produces identical state on a second device.
* Privacy: uploaded photos have EXIF stripped; problems are private unless explicitly shared.
* Auto mask is “usable”:

  * for most problems, overlay covers intended holds enough that user doesn’t need to edit;
  * when wrong, can be fixed in ≤ 20 seconds.
* Sharing:

  * friend opens shared link, joins, logs outcome; both logs persist.
* All state transitions produce events.
* Export: user can export sessions/problems/logs/masks/events as JSON.

---

# Implementation tasks, organized into threads

Each thread is internally sequential; threads can run in parallel. The MVP is the composition of all threads.

---

## Thread 1: Backend foundation (schema + storage + access)

1. Define DB schema and migrations (tables listed above).
2. Configure storage buckets for `photos` and `masks`.
3. Implement row-level security policies:

   * sessions: owner only
   * problems: creator + members read
   * problem_members: owner can add; member can read
   * user_problem_logs: owner can write/read their rows
   * route_masks/media: gated by problem access
   * events: owner writes; owner reads
4. Implement minimal auth (email OTP or equivalent).
5. Create a thin API layer if needed (otherwise use direct SDK):

   * create session
   * create problem
   * upload media
   * insert mask version
   * resolve `problem_share_links.token` → problem_id
   * join problem (create `problem_members` row)

**Thread done when:** a user can create/read all entities in DB with correct access boundaries.

---

## Thread 2: Local persistence + outbox sync (correctness first)

1. Create local SQLite schema mirroring cloud entities plus:

   * `outbox_events`
   * `outbox_media`
   * `sync_state` (last `server_ts` watermark)
2. Implement write-path functions that:

   * write local entity rows
   * append corresponding events
   * enqueue media uploads
3. Implement sync worker:

   * upload pending media → receive cloud URL/path → update local
   * flush events (idempotent)
   * upsert entities to cloud (sessions/problems/logs/masks)
   * pull remote changes for shared problems (basic delta by updated_at, plus event stream by `server_ts` if available)
4. Add retry/backoff + failure states visible to user (non-blocking).
5. Add deterministic reconciliation on app restart (resume sync safely).

**Thread done when:** airplane-mode session logging works and later sync is consistent and repeatable.

---

## Thread 3: Session + problem logging UX (photo + tap loop)

1. Home screen:

   * Start session
   * List sessions (basic)
2. Session feed:

   * Problem camera entry
   * list of problems created in session
   * End session
3. Problem capture:

   * camera
   * compression/downscale
   * strip EXIF + generate thumbnail
   * compute lightweight photo fingerprint (`photo_phash`) for optional dedupe suggestions
   * create local problem + media + events
4. Problem detail:

   * outcome selector
   * attempts widget (gated by settings)
   * grade range input (optional)
   * note input (optional)
   * save updates local log + events
5. Minimal session summary (non-analytics):

   * counts: problems logged, sends, flashes (computed from local logs)

**Thread done when:** the full “session → multiple problems → end” flow is smooth and reliable without masks.

---

## Thread 4: Masking v1 (dominant color auto-mask + overlay)

1. Implement on-device mask generation pipeline:

   * downscale
   * color clustering + scoring
   * mask cleanup
   * confidence estimate
2. Store mask as PNG and attach to `route_masks` version=1.
3. Show mask overlay on problem card (toggle on/off).
4. Auto-regenerate mask if photo changes; ensure versioning is stable.
5. If confidence is low, fall back to a 1-tap “seed color” prompt and regenerate from that seed.

**Thread done when:** every photo produces a mask overlay automatically and it persists across app restarts + sync.

---

## Thread 5: Mask editing (fast correction + versioning)

1. Mask edit mode UI:

   * brush add/remove
   * pan/zoom
   * optional undo/redo (nice-to-have)
2. Save edited mask:

   * new `route_masks` row with incremented version
   * upload mask media
   * append `route_mask_updated` event with delta metadata (optional)
3. Ensure edited mask becomes the active mask used for display.

**Thread done when:** users can correct edge cases quickly and edits persist.

---

## Thread 6: Sharing + membership + friend logs

1. Generate share link (deep link) containing a `problem_share_links.token`.
2. Deep link handler:

   * resolve token → problem_id
   * fetch problem
   * if not a member → show join screen → create `problem_members` row + event
3. Friend view:

   * see photo + mask + minimal details
   * log their own outcome/attempts/grade (creates their `user_problem_logs` row)
4. Show “friends’ outcomes” list on problem detail (minimal).

**Thread done when:** two users can attach logs to the same problem card and both are visible where appropriate.

---

## Thread 7: Data hygiene + export (recap-ready verification)

1. Validate event emission coverage:

   * every user action emits an event
2. Add “Export my data” (JSON) from local DB:

   * sessions, problems, logs, masks, events
3. Add basic automated checks:

   * uniqueness constraints
   * sync idempotency (replay outbox doesn’t duplicate)
4. Add instrumentation counters (local):

   * time photo→saved
   * % masks edited
   * sync failures

**Thread done when:** you can export everything needed for year-end recap and trust that state is reconstructible.

---

## Optional thread (only if spare capacity): Async enrichment

1. Add `ai_jobs` table: photo_id → status → outputs_json
2. Cloud worker computes refined mask/tags and writes a new mask version + tag_suggestions.
3. Client shows “refined mask available” and allows accept/reject.

This is optional; the MVP stands without it.

---

## MVP deliverable summary

MVP is complete when Threads **1–6** are done and Thread **7** passes verification. Threads are structured so that the product is usable as soon as Threads 1–4 land; 5–6 add correctness and network effects; 7 ensures future-proofing for recaps.

No analytics UI required. The stored data will support it later.
