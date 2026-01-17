# Supabase Migrations

This directory contains database migrations.

## Creating a new migration

```bash
pnpm supabase migration new <migration_name>
```

## Applying migrations

```bash
pnpm supabase db reset  # Reset and apply all migrations
```

## Generating types

After schema changes, regenerate TypeScript types:

```bash
pnpm supabase:types
```
