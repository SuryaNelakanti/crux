import type {
  AppEvent,
  Media,
  Problem,
  ProblemMember,
  RouteMask,
  Session,
  User,
  UserProblemLog,
} from '@crux/shared';
import { getClient } from './client';

type NullableDate = Date | string | null | undefined;

const toIso = (value: NullableDate): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

// Temporary helper to bypass strict typing until proper Supabase types are generated.
// biome-ignore lint/suspicious/noExplicitAny: Supabase types are generated later.
const getUntypedClient = () => getClient() as any;

// ============================================================================
// Inserts / Upserts
// ============================================================================

export async function upsertUsers(rows: User[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getUntypedClient();
  const payload = rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    created_at: toIso(row.createdAt),
  }));
  const { error } = await client.from('users').upsert(payload, {
    onConflict: 'id',
  });
  if (error) {
    throw new Error(`Failed to upsert users: ${error.message}`);
  }
}

export async function upsertSessions(rows: Session[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getUntypedClient();
  const payload = rows.map((row) => ({
    id: row.id,
    user_id: row.userId,
    start_ts: toIso(row.startTs),
    end_ts: toIso(row.endTs),
    gym_label: row.gymLabel,
    created_at: toIso(row.createdAt),
  }));
  const { error } = await client.from('sessions').upsert(payload, {
    onConflict: 'id',
  });
  if (error) {
    throw new Error(`Failed to upsert sessions: ${error.message}`);
  }
}

export async function upsertProblems(rows: Problem[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getUntypedClient();
  const payload = rows.map((row) => ({
    id: row.id,
    created_by: row.createdBy,
    created_at: toIso(row.createdAt),
    created_in_session_id: row.createdInSessionId,
    primary_media_id: row.primaryMediaId,
    photo_phash: row.photoPhash,
  }));
  const { error } = await client.from('problems').upsert(payload, {
    onConflict: 'id',
  });
  if (error) {
    throw new Error(`Failed to upsert problems: ${error.message}`);
  }
}

export async function upsertProblemMembers(rows: ProblemMember[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getUntypedClient();
  const payload = rows.map((row) => ({
    problem_id: row.problemId,
    user_id: row.userId,
    role: row.role,
    joined_at: toIso(row.joinedAt),
  }));
  const { error } = await client.from('problem_members').upsert(payload, {
    onConflict: 'problem_id,user_id',
  });
  if (error) {
    throw new Error(`Failed to upsert problem members: ${error.message}`);
  }
}

export async function upsertMedia(rows: Media[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getUntypedClient();
  const payload = rows.map((row) => ({
    id: row.id,
    problem_id: row.problemId,
    type: row.type,
    storage_path: row.storagePath,
    width: row.width,
    height: row.height,
    created_at: toIso(row.createdAt),
    sha256: row.sha256,
    bytes: row.bytes,
    metadata_json: row.metadataJson,
  }));
  const { error } = await client.from('media').upsert(payload, {
    onConflict: 'id',
  });
  if (error) {
    throw new Error(`Failed to upsert media: ${error.message}`);
  }
}

export async function upsertRouteMasks(rows: RouteMask[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getUntypedClient();
  const payload = rows.map((row) => ({
    id: row.id,
    problem_id: row.problemId,
    version: row.version,
    mask_media_id: row.maskMediaId,
    method: row.method,
    seed_color_json: row.seedColorJson,
    confidence: row.confidence,
    created_by: row.createdBy,
    created_at: toIso(row.createdAt),
  }));
  const { error } = await client.from('route_masks').upsert(payload, {
    onConflict: 'id',
  });
  if (error) {
    throw new Error(`Failed to upsert route masks: ${error.message}`);
  }
}

export async function upsertUserProblemLogs(rows: UserProblemLog[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getUntypedClient();
  const payload = rows.map((row) => ({
    id: row.id,
    user_id: row.userId,
    problem_id: row.problemId,
    session_id: row.sessionId,
    outcome: row.outcome,
    attempts_count: row.attemptsCount,
    grade_min: row.gradeMin,
    grade_max: row.gradeMax,
    note: row.note,
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  }));
  const { error } = await client.from('user_problem_logs').upsert(payload, {
    onConflict: 'id',
  });
  if (error) {
    throw new Error(`Failed to upsert user problem logs: ${error.message}`);
  }
}

export async function insertEvents(events: AppEvent[]): Promise<void> {
  if (events.length === 0) return;
  const client = getUntypedClient();
  const payload = events.map((event) => ({
    id: event.id,
    user_id: event.userId,
    session_id: event.sessionId,
    problem_id: event.problemId,
    type: event.type,
    payload_json: event.payloadJson,
    client_ts: toIso(event.clientTs),
    // server_ts uses database default now()
  }));
  const { error } = await client.from('events').insert(payload);
  if (error) {
    throw new Error(`Failed to insert events: ${error.message}`);
  }
}

// ============================================================================
// Share link helpers
// ============================================================================

export async function resolveProblemShareToken(token: string): Promise<string | null> {
  const client = getUntypedClient();
  const { data, error } = await client.rpc('resolve_problem_share_token', {
    p_token: token,
  });
  if (error) {
    throw new Error(`Failed to resolve share token: ${error.message}`);
  }
  return data ?? null;
}

export async function joinProblemWithToken(token: string): Promise<string | null> {
  const client = getUntypedClient();
  const { data, error } = await client.rpc('join_problem_with_token', {
    p_token: token,
  });
  if (error) {
    throw new Error(`Failed to join with token: ${error.message}`);
  }
  return data ?? null;
}
