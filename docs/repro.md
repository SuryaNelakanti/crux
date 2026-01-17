# MVP Repro

## Local-only flow
1. `pnpm -C apps/mobile start`
2. Open the app in the simulator/device.
3. Tap `Start Session`.
4. Tap `+ Problem`, grant camera permission, capture a photo.
5. On the problem screen, pick an outcome and save.
6. Kill and relaunch the app.
7. Confirm the session and problem still appear.

## Optional sync flow (requires Supabase)
1. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
2. Start the app and log a session + problem.
3. Re-open the session screen to trigger `runSync`.
4. Verify rows exist in Supabase tables (`sessions`, `problems`, `media`, `events`, `user_problem_logs`).
5. Note: current MVP sync assumes the local user id matches the Supabase auth uid (no auth UI yet).
