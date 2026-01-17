import type {
    Media,
    Problem,
    ProblemMember,
    RouteMask,
    UserProblemLog,
} from '@crux/shared';
import { getDb } from './schema';

export async function upsertRemoteProblemMembers(
    members: ProblemMember[]
): Promise<void> {
    const db = await getDb();
    for (const member of members) {
        await db.runAsync(
            `
            insert into problem_members (problem_id, user_id, role, joined_at)
            values (?, ?, ?, ?)
            on conflict (problem_id, user_id) do update set
                role = excluded.role,
                joined_at = excluded.joined_at
            `,
            [
                member.problemId,
                member.userId,
                member.role,
                member.joinedAt.toISOString(),
            ]
        );
    }
}

export async function upsertRemoteProblems(problems: Problem[]): Promise<void> {
    const db = await getDb();
    for (const problem of problems) {
        await db.runAsync(
            `
            insert into problems (
                id, created_by, created_at, created_in_session_id, primary_media_id, photo_phash
            ) values (?, ?, ?, ?, ?, ?)
            on conflict (id) do update set
                created_by = excluded.created_by,
                created_at = excluded.created_at,
                created_in_session_id = excluded.created_in_session_id,
                primary_media_id = excluded.primary_media_id,
                photo_phash = excluded.photo_phash
            `,
            [
                problem.id,
                problem.createdBy,
                problem.createdAt.toISOString(),
                problem.createdInSessionId,
                problem.primaryMediaId,
                problem.photoPhash,
            ]
        );
    }
}

export async function upsertRemoteMedia(rows: Media[]): Promise<void> {
    const db = await getDb();
    for (const media of rows) {
        await db.runAsync(
            `
            insert into media (
                id, problem_id, type, storage_path, local_path, width, height, created_at, sha256, bytes, metadata_json
            ) values (?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)
            on conflict (id) do update set
                problem_id = excluded.problem_id,
                type = excluded.type,
                storage_path = excluded.storage_path,
                width = excluded.width,
                height = excluded.height,
                created_at = excluded.created_at,
                sha256 = excluded.sha256,
                bytes = excluded.bytes,
                metadata_json = excluded.metadata_json
            `,
            [
                media.id,
                media.problemId,
                media.type,
                media.storagePath,
                media.width,
                media.height,
                media.createdAt.toISOString(),
                media.sha256,
                media.bytes,
                media.metadataJson ? JSON.stringify(media.metadataJson) : null,
            ]
        );
    }
}

export async function upsertRemoteRouteMasks(rows: RouteMask[]): Promise<void> {
    const db = await getDb();
    for (const mask of rows) {
        await db.runAsync(
            `
            insert into route_masks (
                id, problem_id, version, mask_media_id, method, seed_color_json, confidence, created_by, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict (id) do update set
                problem_id = excluded.problem_id,
                version = excluded.version,
                mask_media_id = excluded.mask_media_id,
                method = excluded.method,
                seed_color_json = excluded.seed_color_json,
                confidence = excluded.confidence,
                created_by = excluded.created_by,
                created_at = excluded.created_at
            `,
            [
                mask.id,
                mask.problemId,
                mask.version,
                mask.maskMediaId,
                mask.method,
                mask.seedColorJson ? JSON.stringify(mask.seedColorJson) : null,
                mask.confidence,
                mask.createdBy,
                mask.createdAt.toISOString(),
            ]
        );
    }
}

export async function upsertRemoteUserProblemLogs(
    rows: UserProblemLog[]
): Promise<void> {
    const db = await getDb();
    for (const log of rows) {
        await db.runAsync(
            `
            insert into user_problem_logs (
                id, user_id, problem_id, session_id, outcome, attempts_count,
                grade_min, grade_max, note, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict (user_id, problem_id, session_id) do update set
                outcome = excluded.outcome,
                attempts_count = excluded.attempts_count,
                grade_min = excluded.grade_min,
                grade_max = excluded.grade_max,
                note = excluded.note,
                updated_at = excluded.updated_at
            `,
            [
                log.id,
                log.userId,
                log.problemId,
                log.sessionId,
                log.outcome,
                log.attemptsCount,
                log.gradeMin,
                log.gradeMax,
                log.note,
                log.createdAt.toISOString(),
                log.updatedAt.toISOString(),
            ]
        );
    }
}
