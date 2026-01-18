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

**Status:** Accepted

**Context:**
Auto mask works for most photos, but when hold color is off, users had no quick
way to re-run the mask without brushing everything. The mask overlay was also
too subtle to read on the photo.

**Decision:**
Add a `Pick hold color` action in the web mask editor that samples a pixel and
re-runs the auto mask with a seed color. Increase overlay visibility with a
stronger tint and normal blend mode.

**Consequences:**
- Users can re-mask quickly without full manual edits
- Saved mask versions capture whether they were auto/seed/manual
- Overlay readability improves across photo lighting conditions
