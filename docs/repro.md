# MVP Repro

## Local-only flow
1. `pnpm -C mobapp start`
2. Open the app in the simulator/device.
3. Tap `Start Session`.
4. Tap `+ Problem`, grant camera permission, capture a photo.
5. On the problem screen, wait for the mask overlay and toggle it on/off.
6. Tap `Edit Mask`, brush add/remove, then save the new mask version.
7. On the problem screen, pick an outcome and save.
8. Kill and relaunch the app.
9. Confirm the session, problem, and mask still appear.

## Optional sync flow (requires Supabase)
1. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
2. Start the app and log a session + problem.
3. Re-open the session screen to trigger `runSync`.
4. Verify rows exist in Supabase tables (`sessions`, `problems`, `media`, `route_masks`, `events`, `user_problem_logs`).
5. Note: current MVP sync assumes the local user id matches the Supabase auth uid (no auth UI yet).

## Web flow (local mock, default)
1. `pnpm -C webapp dev`
2. Open the web app. It enters a seeded active session without authentication or network calls.
3. Review the example Flash and Sent climbs.
4. Tap `Log a climb` and choose a local photo.
5. Confirm the existing heuristic pipeline generates a route-mask overlay.
6. Tap Flash, Sent, or Tried. Confirm the app returns to the active session without a separate save action.
7. Open the problem again, add attempts, grade, or a note, then update details.
8. Open `Fix route`, brush add/remove, and save a new mask version.
9. Reload the page. Confirm the session, problem, log, and mask remain.
10. Tap `Reset demo` to restore the seed state.

## Web integration flow (Supabase)
1. Set `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in `webapp/.env`.
2. `pnpm -C webapp dev`
3. Sign in via magic link.
4. Repeat the capture, mask, outcome, detail, and mask-version checks above.
