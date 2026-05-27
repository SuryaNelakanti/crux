# Fresh Supabase Setup

Use this when the hosted Supabase project was deleted or you need to connect this repo to a new Supabase project.

## Hosted Supabase

1. Create a new project in the Supabase dashboard.
2. Copy the project URL, anon/public key, project ref, and database password.
3. Update `webapp/.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

4. Link the repo to the hosted project:

```powershell
cd C:\Users\ASUS\Documents\Projects\crux-journal\backend
npx supabase login
npx supabase link --project-ref <project-ref>
```

5. Push migrations:

```powershell
npx supabase db push
```

6. Regenerate database types from the hosted project:

```powershell
npx supabase gen types typescript --linked > ..\packages\shared\src\database.types.ts
```

7. Run the web app:

```powershell
cd C:\Users\ASUS\Documents\Projects\crux-journal
pnpm dev
```

## Local Supabase

Local Supabase requires Docker Desktop on Windows.

```powershell
cd C:\Users\ASUS\Documents\Projects\crux-journal
pnpm supabase:start
pnpm supabase:reset
```

Copy the local API URL and anon key printed by `supabase start` into `webapp/.env`.

## Notes

- Hosted setup does not require Docker.
- Local setup does require Docker Desktop to be installed and running.
- `backend/supabase/.temp/` is created by the Supabase CLI after linking and should not be committed.
- Migrations recreate schema, RLS policies, and storage buckets. They do not restore old table rows or uploaded files from a deleted project.
