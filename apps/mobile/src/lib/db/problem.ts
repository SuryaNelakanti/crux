import {
    generateId,
    formatGradeRange,
    type Media,
    type Outcome,
    type Problem,
    type UserProblemLog,
} from '@crux/shared';
import { appendEvent, enqueueOutboxMedia } from './outbox';
import { getDb, getLocalUserId, initDb, parseJson } from './schema';

export interface ProblemCardItem {
    problemId: string;
    imageUri: string | null;
    maskUri: string | null;
    outcome: Outcome | null;
    gradeLabel: string | null;
    attemptsCount: number | null;
}

export async function createProblemFromPhoto(params: {
    sessionId: string;
    localPath: string;
    width: number;
    height: number;
    bytes: number | null;
    metadataJson?: Record<string, unknown> | null;
}): Promise<{ problemId: string; mediaId: string }> {
    const { db, localUserId } = await initDb();
    const now = new Date();
    const problemId = generateId();
    const mediaId = generateId();

    const metadata = params.metadataJson
        ? JSON.stringify(params.metadataJson)
        : null;

    await db.runAsync(
        `
        insert into problems (
            id, created_by, created_at, created_in_session_id, primary_media_id, photo_phash
        ) values (?, ?, ?, ?, ?, null)
        `,
        [
            problemId,
            localUserId,
            now.toISOString(),
            params.sessionId,
            mediaId,
        ]
    );

    await db.runAsync(
        `
        insert into media (
            id, problem_id, type, storage_path, local_path, width, height, created_at, sha256, bytes, metadata_json
        ) values (?, ?, 'photo', null, ?, ?, ?, ?, null, ?, ?)
        `,
        [
            mediaId,
            problemId,
            params.localPath,
            params.width,
            params.height,
            now.toISOString(),
            params.bytes,
            metadata,
        ]
    );

    await db.runAsync(
        `
        insert into problem_members (problem_id, user_id, role, joined_at)
        values (?, ?, 'owner', ?)
        `,
        [problemId, localUserId, now.toISOString()]
    );

    await enqueueOutboxMedia(mediaId, params.localPath);

    await appendEvent({
        type: 'problem_created',
        userId: localUserId,
        sessionId: params.sessionId,
        problemId,
        payloadJson: {
            problemId,
            createdInSessionId: params.sessionId,
            primaryMediaId: mediaId,
        },
    });

    await appendEvent({
        type: 'problem_media_added',
        userId: localUserId,
        sessionId: params.sessionId,
        problemId,
        payloadJson: { problemId, mediaId, type: 'photo' },
    });

    return { problemId, mediaId };
}

export async function getProblemCardsForSession(
    sessionId: string
): Promise<ProblemCardItem[]> {
    const db = await getDb();
    const userId = await getLocalUserId();
    const rows = await db.getAllAsync<{
        problem_id: string;
        image_uri: string | null;
        mask_uri: string | null;
        outcome: Outcome | null;
        grade_min: number | null;
        grade_max: number | null;
        attempts_count: number | null;
    }>(
        `
        select
            p.id as problem_id,
            m.local_path as image_uri,
            mm.local_path as mask_uri,
            l.outcome,
            l.grade_min,
            l.grade_max,
            l.attempts_count
        from problems p
        left join media m on m.id = p.primary_media_id
        left join (
            select rm.problem_id, rm.mask_media_id, rm.version
              from route_masks rm
              join (
                    select problem_id, max(version) as max_version
                      from route_masks
                     group by problem_id
                   ) latest
                on latest.problem_id = rm.problem_id
               and latest.max_version = rm.version
        ) active on active.problem_id = p.id
        left join media mm on mm.id = active.mask_media_id
        left join user_problem_logs l
          on l.problem_id = p.id
         and l.user_id = ?
        where p.created_in_session_id = ?
        order by p.created_at desc
        `,
        [userId, sessionId]
    );

    return rows.map((row) => ({
        problemId: row.problem_id,
        imageUri: row.image_uri ?? null,
        maskUri: row.mask_uri ?? null,
        outcome: row.outcome ?? null,
        gradeLabel:
            row.grade_min === null && row.grade_max === null
                ? null
            : formatGradeRange(row.grade_min, row.grade_max, 'v_scale'),    
        attemptsCount: row.attempts_count ?? null,
    }));
}

export async function getProblemById(problemId: string): Promise<{
    problem: Problem;
    media: (Media & { localPath: string | null }) | null;
} | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{
        id: string;
        created_by: string;
        created_at: string;
        created_in_session_id: string | null;
        primary_media_id: string | null;
        photo_phash: string | null;
        media_id: string | null;
        type: 'photo' | 'mask' | null;
        storage_path: string | null;
        local_path: string | null;
        width: number | null;
        height: number | null;
        media_created_at: string | null;
        sha256: string | null;
        bytes: number | null;
        metadata_json: string | null;
    }>(
        `
        select
            p.*,
            m.id as media_id,
            m.type,
            m.storage_path,
            m.local_path,
            m.width,
            m.height,
            m.created_at as media_created_at,
            m.sha256,
            m.bytes,
            m.metadata_json
        from problems p
        left join media m on m.id = p.primary_media_id
        where p.id = ?
        `,
        [problemId]
    );

    if (!row) return null;

    const problem: Problem = {
        id: row.id,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
        createdInSessionId: row.created_in_session_id,
        primaryMediaId: row.primary_media_id,
        photoPhash: row.photo_phash,
    };

    const media = row.media_id
        ? {
              id: row.media_id,
              problemId: row.id,
              type: row.type ?? 'photo',
              storagePath: row.storage_path ?? '',
              width: row.width ?? 0,
              height: row.height ?? 0,
              createdAt: row.media_created_at
                  ? new Date(row.media_created_at)
                  : new Date(row.created_at),
              sha256: row.sha256,
              bytes: row.bytes,
              metadataJson: parseJson(row.metadata_json, null),
              localPath: row.local_path,
          }
        : null;

    return { problem, media };
}

export async function upsertUserProblemLog(params: {
    problemId: string;
    sessionId: string;
    outcome: Outcome;
    attemptsCount: number | null;
    gradeMin: number | null;
    gradeMax: number | null;
    note: string | null;
}): Promise<void> {
    const { db, localUserId } = await initDb();
    const now = new Date();

    const existing = await db.getFirstAsync<{ id: string }>(
        'select id from user_problem_logs where user_id = ? and problem_id = ? and session_id = ?',
        [localUserId, params.problemId, params.sessionId]
    );

    const logId = existing?.id ?? generateId();

    if (!existing) {
        await db.runAsync(
            `
            insert into user_problem_logs (
                id, user_id, problem_id, session_id, outcome, attempts_count,
                grade_min, grade_max, note, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                logId,
                localUserId,
                params.problemId,
                params.sessionId,
                params.outcome,
                params.attemptsCount,
                params.gradeMin,
                params.gradeMax,
                params.note,
                now.toISOString(),
                now.toISOString(),
            ]
        );
    } else {
        await db.runAsync(
            `
            update user_problem_logs
               set outcome = ?,
                   attempts_count = ?,
                   grade_min = ?,
                   grade_max = ?,
                   note = ?,
                   updated_at = ?
             where id = ?
            `,
            [
                params.outcome,
                params.attemptsCount,
                params.gradeMin,
                params.gradeMax,
                params.note,
                now.toISOString(),
                logId,
            ]
        );
    }

    await appendEvent({
        type: 'user_problem_log_upserted',
        userId: localUserId,
        sessionId: params.sessionId,
        problemId: params.problemId,
        payloadJson: {
            userId: localUserId,
            problemId: params.problemId,
            sessionId: params.sessionId,
            outcome: params.outcome,
            attemptsCount: params.attemptsCount,
            gradeMin: params.gradeMin,
            gradeMax: params.gradeMax,
        },
    });
}

export async function getUserProblemLog(
    problemId: string,
    sessionId: string
): Promise<UserProblemLog | null> {
    const db = await getDb();
    const userId = await getLocalUserId();
    const row = await db.getFirstAsync<{
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
    }>(
        'select * from user_problem_logs where user_id = ? and problem_id = ? and session_id = ?',
        [userId, problemId, sessionId]
    );

    if (!row) return null;

    return {
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
    };
}
