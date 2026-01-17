import {
    insertEvents,
    upsertMedia,
    upsertProblemMembers,
    upsertProblems,
    upsertRouteMasks,
    upsertSessions,
    upsertUserProblemLogs,
    upsertUsers,
    uploadMask,
    uploadPhoto,
} from '@crux/supabase-client';
import type {
    Media,
    Problem,
    ProblemMember,
    RouteMask,
    UserProblemLog,
} from '@crux/shared';
import {
    getAllMedia,
    getAllProblemMembers,
    getAllProblems,
    getAllRouteMasks,
    getAllSessions,
    getAllUserProblemLogs,
    getAllUsers,
    getEventById,
    getMediaById,
    getPendingOutboxEvents,
    getPendingOutboxMedia,
    markOutboxEventFailed,
    markOutboxMediaFailed,
    markOutboxMediaUploading,
    removeOutboxEvent,
    removeOutboxMedia,
    updateMediaStoragePath,
    updateSyncState,
    getSyncState,
    upsertRemoteMedia,
    upsertRemoteProblemMembers,
    upsertRemoteProblems,
    upsertRemoteRouteMasks,
    upsertRemoteUserProblemLogs,
} from './db';
import { flushOutboxEvents } from './sync/outbox';
import { getSupabaseClient } from './supabase';

// Type definitions for Supabase row responses
// These match the database schema and are needed because the Database
// type is a placeholder until `pnpm supabase:types` is run
interface ProblemMemberRow {
    problem_id: string;
    user_id: string;
    role: 'owner' | 'member';
    joined_at: string;
}

interface ProblemRow {
    id: string;
    created_by: string;
    created_at: string;
    created_in_session_id: string | null;
    primary_media_id: string | null;
    photo_phash: string | null;
}

interface MediaRow {
    id: string;
    problem_id: string;
    type: 'photo' | 'mask';
    storage_path: string | null;
    width: number | null;
    height: number | null;
    created_at: string;
    sha256: string | null;
    bytes: number | null;
    metadata_json: Record<string, unknown> | null;
}

interface RouteMaskRow {
    id: string;
    problem_id: string;
    version: number;
    mask_media_id: string;
    method: string;
    seed_color_json: Record<string, unknown> | null;
    confidence: number | null;
    created_by: string;
    created_at: string;
}

interface UserProblemLogRow {
    id: string;
    user_id: string;
    problem_id: string;
    session_id: string;
    outcome: 'flash' | 'send' | 'tried' | 'project' | null;
    attempts_count: number | null;
    grade_min: number | null;
    grade_max: number | null;
    note: string | null;
    created_at: string;
    updated_at: string;
}

export async function runSync(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) return;

    const { localUserId } = await getSyncState();
    if (localUserId && localUserId !== userData.user.id) {
        return;
    }

    await uploadPendingMedia();
    await flushPendingEvents();
    await upsertLocalEntities();
    await pullRemoteUpdates(userData.user.id);

    await updateSyncState({ lastServerTs: new Date(), lastSyncAt: new Date() });
}

async function uploadPendingMedia(): Promise<void> {
    const items = await getPendingOutboxMedia();
    for (const item of items) {
        await markOutboxMediaUploading(item.id);
        try {
            const media = await getMediaById(item.mediaId);
            if (!media) {
                await removeOutboxMedia(item.id);
                continue;
            }

            const response = await fetch(item.localPath);
            const blob = await response.blob();

            const upload =
                media.type === 'photo'
                    ? await uploadPhoto(media.problemId, media.id, blob)
                    : await uploadMask(media.problemId, media.id, blob);

            await updateMediaStoragePath(media.id, upload.path);
            await removeOutboxMedia(item.id);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'upload failed';
            await markOutboxMediaFailed(
                item.id,
                item.retryCount + 1,
                message
            );
        }
    }
}

async function flushPendingEvents(): Promise<void> {
    await flushOutboxEvents({
        getPendingOutboxEvents,
        getEventById,
        insertEvents,
        removeOutboxEvent,
        markOutboxEventFailed,
    });
}

async function upsertLocalEntities(): Promise<void> {
    await upsertUsers(await getAllUsers());
    await upsertSessions(await getAllSessions());
    await upsertProblems(await getAllProblems());
    await upsertProblemMembers(await getAllProblemMembers());
    await upsertMedia(await getAllMedia());
    await upsertRouteMasks(await getAllRouteMasks());
    await upsertUserProblemLogs(await getAllUserProblemLogs());
}

async function pullRemoteUpdates(currentUserId: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { lastSyncAt } = await getSyncState();

    const { data: memberRowsData, error: memberError } = await client
        .from('problem_members')
        .select('*')
        .eq('user_id', currentUserId);

    if (memberError || !memberRowsData) return;

    const memberRows = memberRowsData as unknown as ProblemMemberRow[];
    const memberships: ProblemMember[] = memberRows.map((row) => ({
        problemId: row.problem_id,
        userId: row.user_id,
        role: row.role,
        joinedAt: new Date(row.joined_at),
    }));

    const memberProblemIds = memberships.map((m) => m.problemId);
    const { data: ownedRowsData } = await client
        .from('problems')
        .select('id')
        .eq('created_by', currentUserId);

    const ownedRows = (ownedRowsData ?? []) as unknown as { id: string }[];
    const ownedIds = ownedRows.map((row) => row.id);
    const problemIds = Array.from(new Set([...memberProblemIds, ...ownedIds]));

    if (problemIds.length === 0) {
        return;
    }

    const { data: problemsRowsData } = await client
        .from('problems')
        .select('*')
        .in('id', problemIds);
    const problemsRows = (problemsRowsData ?? []) as unknown as ProblemRow[];

    const { data: mediaRowsData } = await client
        .from('media')
        .select('*')
        .in('problem_id', problemIds);
    const mediaRows = (mediaRowsData ?? []) as unknown as MediaRow[];

    const { data: maskRowsData } = await client
        .from('route_masks')
        .select('*')
        .in('problem_id', problemIds);
    const maskRows = (maskRowsData ?? []) as unknown as RouteMaskRow[];

    const logsQuery = client
        .from('user_problem_logs')
        .select('*')
        .in('problem_id', problemIds);

    const { data: logRowsData } = lastSyncAt
        ? await logsQuery.gte('updated_at', lastSyncAt.toISOString())
        : await logsQuery;
    const logRows = (logRowsData ?? []) as unknown as UserProblemLogRow[];

    const problems: Problem[] = problemsRows.map((row) => ({
        id: row.id,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
        createdInSessionId: row.created_in_session_id,
        primaryMediaId: row.primary_media_id,
        photoPhash: row.photo_phash,
    }));

    // Filter out media records missing required fields
    const media: Media[] = mediaRows
        .filter((row) => row.storage_path !== null && row.width !== null && row.height !== null)
        .map((row) => ({
            id: row.id,
            problemId: row.problem_id,
            type: row.type,
            storagePath: row.storage_path as string,
            width: row.width as number,
            height: row.height as number,
            createdAt: new Date(row.created_at),
            sha256: row.sha256,
            bytes: row.bytes,
            metadataJson: row.metadata_json,
        }));

    const masks: RouteMask[] = maskRows.map((row) => ({
        id: row.id,
        problemId: row.problem_id,
        version: row.version,
        maskMediaId: row.mask_media_id,
        method: row.method as import('@crux/shared').MaskMethod,
        seedColorJson: row.seed_color_json as { h: number; s: number; l: number } | null,
        confidence: row.confidence,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
    }));

    // Filter out logs with null outcomes and cast outcome to Outcome type
    const logs: UserProblemLog[] = logRows
        .filter((row) => row.outcome !== null)
        .map((row) => ({
            id: row.id,
            userId: row.user_id,
            problemId: row.problem_id,
            sessionId: row.session_id,
            outcome: row.outcome as import('@crux/shared').Outcome,
            attemptsCount: row.attempts_count,
            gradeMin: row.grade_min,
            gradeMax: row.grade_max,
            note: row.note,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        }));

    await upsertRemoteProblemMembers(memberships);
    await upsertRemoteProblems(problems);
    await upsertRemoteMedia(media);
    await upsertRemoteRouteMasks(masks);
    await upsertRemoteUserProblemLogs(logs);
}
