import type {
  Media,
  Outcome,
  Problem,
  ProblemMember,
  RouteMask,
  Session,
  User,
  UserProblemLog,
} from '@crux/shared';
import { fromIso, getDb, parseJson } from './schema';

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    handle: string | null;
    created_at: string;
  }>('select * from users');
  return rows.map((row) => ({
    id: row.id,
    handle: row.handle ?? '',
    createdAt: new Date(row.created_at),
  }));
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    user_id: string;
    start_ts: string;
    end_ts: string | null;
    gym_label: string | null;
    created_at: string;
  }>('select * from sessions');
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    startTs: new Date(row.start_ts),
    endTs: fromIso(row.end_ts),
    gymLabel: row.gym_label,
    createdAt: new Date(row.created_at),
  }));
}

export async function getAllProblems(): Promise<Problem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    created_by: string;
    created_at: string;
    created_in_session_id: string | null;
    primary_media_id: string | null;
    photo_phash: string | null;
  }>('select * from problems');
  return rows.map((row) => ({
    id: row.id,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    createdInSessionId: row.created_in_session_id,
    primaryMediaId: row.primary_media_id,
    photoPhash: row.photo_phash,
  }));
}

export async function getAllProblemMembers(): Promise<ProblemMember[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    problem_id: string;
    user_id: string;
    role: 'owner' | 'member';
    joined_at: string;
  }>('select * from problem_members');
  return rows.map((row) => ({
    problemId: row.problem_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: new Date(row.joined_at),
  }));
}

export async function getAllMedia(): Promise<Media[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    problem_id: string;
    type: 'photo' | 'mask';
    storage_path: string | null;
    width: number;
    height: number;
    created_at: string;
    sha256: string | null;
    bytes: number | null;
    metadata_json: string | null;
  }>('select * from media');
  return rows.map((row) => ({
    id: row.id,
    problemId: row.problem_id,
    type: row.type,
    storagePath: row.storage_path ?? '',
    width: row.width,
    height: row.height,
    createdAt: new Date(row.created_at),
    sha256: row.sha256,
    bytes: row.bytes,
    metadataJson: parseJson(row.metadata_json, null),
  }));
}

export async function getAllRouteMasks(): Promise<RouteMask[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    problem_id: string;
    version: number;
    mask_media_id: string;
    method: 'auto' | 'color-dominant' | 'manual-edit' | 'seed-color';
    seed_color_json: string | null;
    confidence: number | null;
    created_by: string;
    created_at: string;
  }>('select * from route_masks');
  return rows.map((row) => ({
    id: row.id,
    problemId: row.problem_id,
    version: row.version,
    maskMediaId: row.mask_media_id,
    method: row.method,
    seedColorJson: parseJson(row.seed_color_json, null),
    confidence: row.confidence,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
  }));
}

export async function getAllUserProblemLogs(): Promise<UserProblemLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    user_id: string;
    problem_id: string;
    session_id: string;
    outcome: Outcome;
    attempts_count: number | null;
    grade_min: number | null;
    grade_max: number | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>('select * from user_problem_logs');
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    problemId: row.problem_id,
    sessionId: row.session_id,
    outcome: row.outcome,
    attemptsCount: row.attempts_count,
    gradeMin: row.grade_min,
    gradeMax: row.grade_max,
    note: row.note,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}
