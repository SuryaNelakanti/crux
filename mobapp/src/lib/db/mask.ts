import type { MaskMethod } from '@crux/shared';
import { generateId } from '@crux/shared';
import { appendEvent, enqueueOutboxMedia } from './outbox';
import { getDb, initDb, parseJson } from './schema';

export async function createRouteMask(params: {
  problemId: string;
  localPath: string;
  width: number;
  height: number;
  bytes: number | null;
  method: MaskMethod;
  seedColorJson: { h: number; s: number; l: number } | null;
  confidence: number | null;
}): Promise<{ routeMaskId: string; mediaId: string; version: number }> {
  const { db, localUserId } = await initDb();
  const now = new Date();
  const versionRow = await db.getFirstAsync<{ max_version: number | null }>(
    'select max(version) as max_version from route_masks where problem_id = ?',
    [params.problemId]
  );
  const version = (versionRow?.max_version ?? 0) + 1;

  const mediaId = generateId();
  const routeMaskId = generateId();

  await db.runAsync(
    `
        insert into media (
            id, problem_id, type, storage_path, local_path, width, height, created_at, sha256, bytes, metadata_json
        ) values (?, ?, 'mask', null, ?, ?, ?, ?, null, ?, null)
        `,
    [
      mediaId,
      params.problemId,
      params.localPath,
      params.width,
      params.height,
      now.toISOString(),
      params.bytes,
    ]
  );

  await db.runAsync(
    `
        insert into route_masks (
            id, problem_id, version, mask_media_id, method, seed_color_json, confidence, created_by, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
    [
      routeMaskId,
      params.problemId,
      version,
      mediaId,
      params.method,
      params.seedColorJson ? JSON.stringify(params.seedColorJson) : null,
      params.confidence,
      localUserId,
      now.toISOString(),
    ]
  );

  const sessionRow = await db.getFirstAsync<{
    created_in_session_id: string | null;
  }>('select created_in_session_id from problems where id = ?', [params.problemId]);

  await enqueueOutboxMedia(mediaId, params.localPath);

  await appendEvent({
    type: 'problem_media_added',
    userId: localUserId,
    sessionId: sessionRow?.created_in_session_id ?? null,
    problemId: params.problemId,
    payloadJson: {
      problemId: params.problemId,
      mediaId,
      type: 'mask',
    },
  });

  await appendEvent({
    type: version === 1 ? 'route_mask_created' : 'route_mask_updated',
    userId: localUserId,
    sessionId: sessionRow?.created_in_session_id ?? null,
    problemId: params.problemId,
    payloadJson:
      version === 1
        ? {
            problemId: params.problemId,
            routeMaskId,
            method: params.method,
            confidence: params.confidence,
          }
        : {
            problemId: params.problemId,
            routeMaskId,
            method: params.method,
          },
  });

  return { routeMaskId, mediaId, version };
}

export async function getActiveRouteMaskForProblem(problemId: string): Promise<{
  id: string;
  problemId: string;
  version: number;
  maskMediaId: string;
  method: MaskMethod;
  seedColorJson: { h: number; s: number; l: number } | null;
  confidence: number | null;
  createdBy: string;
  createdAt: Date;
  localPath: string | null;
} | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    problem_id: string;
    version: number;
    mask_media_id: string;
    method: MaskMethod;
    seed_color_json: string | null;
    confidence: number | null;
    created_by: string;
    created_at: string;
    local_path: string | null;
  }>(
    `
        select
            rm.*,
            m.local_path
        from route_masks rm
        left join media m on m.id = rm.mask_media_id
        where rm.problem_id = ?
        order by rm.version desc
        limit 1
        `,
    [problemId]
  );

  if (!row) return null;
  return {
    id: row.id,
    problemId: row.problem_id,
    version: row.version,
    maskMediaId: row.mask_media_id,
    method: row.method,
    seedColorJson: parseJson(row.seed_color_json, null),
    confidence: row.confidence,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    localPath: row.local_path,
  };
}
