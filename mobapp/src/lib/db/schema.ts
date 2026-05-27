import { generateId } from '@crux/shared';
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

create table if not exists users (
    id text primary key,
    handle text,
    created_at text not null
);

create table if not exists sessions (
    id text primary key,
    user_id text not null,
    start_ts text not null,
    end_ts text,
    gym_label text,
    created_at text not null
);

create table if not exists problems (
    id text primary key,
    created_by text not null,
    created_at text not null,
    created_in_session_id text,
    primary_media_id text,
    photo_phash text
);

create table if not exists problem_members (
    problem_id text not null,
    user_id text not null,
    role text not null,
    joined_at text not null,
    primary key (problem_id, user_id)
);

create table if not exists problem_share_links (
    id text primary key,
    problem_id text not null,
    created_by text not null,
    token text not null,
    created_at text not null,
    revoked_at text,
    expires_at text
);

create table if not exists media (
    id text primary key,
    problem_id text not null,
    type text not null,
    storage_path text,
    local_path text,
    width integer not null,
    height integer not null,
    created_at text not null,
    sha256 text,
    bytes integer,
    metadata_json text
);

create table if not exists route_masks (
    id text primary key,
    problem_id text not null,
    version integer not null,
    mask_media_id text not null,
    method text not null,
    seed_color_json text,
    confidence real,
    metadata_json text,
    created_by text not null,
    created_at text not null
);

create table if not exists user_problem_logs (
    id text primary key,
    user_id text not null,
    problem_id text not null,
    session_id text not null,
    outcome text not null,
    attempts_count integer,
    grade_min integer,
    grade_max integer,
    note text,
    created_at text not null,
    updated_at text not null,
    unique (user_id, problem_id, session_id)
);

create table if not exists tag_suggestions (
    id text primary key,
    problem_id text not null,
    model_version text not null,
    tags_json text not null,
    confidence_json text,
    raw_features_json text,
    created_at text not null
);

create table if not exists events (
    id text primary key,
    user_id text not null,
    session_id text,
    problem_id text,
    type text not null,
    payload_json text not null,
    client_ts text not null,
    server_ts text
);

create table if not exists settings (
    user_id text primary key,
    attempts_mode text not null,
    grade_scale text not null
);

create table if not exists pain_logs (
    id text primary key,
    session_id text not null,
    user_id text not null,
    body_part text not null,
    score integer not null,
    ts text not null
);

create table if not exists outbox_events (
    id text primary key,
    event_id text not null,
    status text not null,
    retry_count integer not null,
    last_error text,
    created_at text not null
);

create table if not exists outbox_media (
    id text primary key,
    media_id text not null,
    local_path text not null,
    status text not null,
    retry_count integer not null,
    last_error text,
    created_at text not null
);

create table if not exists sync_state (
    id integer primary key check (id = 1),
    local_user_id text,
    last_server_ts text,
    last_sync_at text
);
`;

export const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export const fromIso = (value: string | null): Date | null => (value ? new Date(value) : null);

export const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('crux.db');
  }
  return dbPromise;
}

async function ensureRouteMaskMetadataColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('pragma table_info(route_masks)');
  if (!columns.some((column) => column.name === 'metadata_json')) {
    await db.runAsync('alter table route_masks add column metadata_json text');
  }
}

export async function initDb(): Promise<{
  db: SQLite.SQLiteDatabase;
  localUserId: string;
}> {
  const db = await getDb();
  await db.execAsync(SCHEMA_SQL);
  await ensureRouteMaskMetadataColumn(db);

  const existingState = await db.getFirstAsync<{ local_user_id: string | null }>(
    'select local_user_id from sync_state where id = 1'
  );

  if (!existingState) {
    const localUserId = generateId();
    const now = new Date().toISOString();
    await db.runAsync(
      'insert into sync_state (id, local_user_id, last_server_ts, last_sync_at) values (1, ?, null, null)',
      [localUserId]
    );
    await db.runAsync('insert into users (id, handle, created_at) values (?, null, ?)', [
      localUserId,
      now,
    ]);
    return { db, localUserId };
  }

  if (!existingState.local_user_id) {
    const localUserId = generateId();
    const now = new Date().toISOString();
    await db.runAsync('update sync_state set local_user_id = ? where id = 1', [localUserId]);
    await db.runAsync('insert into users (id, handle, created_at) values (?, null, ?)', [
      localUserId,
      now,
    ]);
    return { db, localUserId };
  }

  return { db, localUserId: existingState.local_user_id };
}

export async function getLocalUserId(): Promise<string> {
  const { localUserId } = await initDb();
  return localUserId;
}

export async function getSyncState(): Promise<{
  lastServerTs: Date | null;
  lastSyncAt: Date | null;
  localUserId: string | null;
}> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    local_user_id: string | null;
    last_server_ts: string | null;
    last_sync_at: string | null;
  }>('select local_user_id, last_server_ts, last_sync_at from sync_state where id = 1');
  if (!row) {
    return { lastServerTs: null, lastSyncAt: null, localUserId: null };
  }
  return {
    localUserId: row.local_user_id,
    lastServerTs: fromIso(row.last_server_ts),
    lastSyncAt: fromIso(row.last_sync_at),
  };
}

export async function updateSyncState(params: {
  lastServerTs: Date | null;
  lastSyncAt: Date | null;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sync_state set last_server_ts = ?, last_sync_at = ? where id = 1', [
    toIso(params.lastServerTs),
    toIso(params.lastSyncAt),
  ]);
}
