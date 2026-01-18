import { type AppEvent, generateId, OUTBOX_MAX_RETRIES } from '@crux/shared';
import { fromIso, getDb, parseJson } from './schema';

export async function appendEvent(params: {
  type: AppEvent['type'];
  userId: string;
  sessionId: string | null;
  problemId: string | null;
  payloadJson: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const event: AppEvent = {
    id: generateId(),
    userId: params.userId,
    sessionId: params.sessionId,
    problemId: params.problemId,
    type: params.type,
    payloadJson: params.payloadJson,
    clientTs: now,
    serverTs: null,
  };

  await db.runAsync(
    `
        insert into events (
            id, user_id, session_id, problem_id, type, payload_json, client_ts, server_ts
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `,
    [
      event.id,
      event.userId,
      event.sessionId,
      event.problemId,
      event.type,
      JSON.stringify(event.payloadJson),
      event.clientTs.toISOString(),
      null,
    ]
  );

  await enqueueOutboxEvent(event.id);
}

async function enqueueOutboxEvent(eventId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `
        insert into outbox_events (id, event_id, status, retry_count, last_error, created_at)
        values (?, ?, 'pending', 0, null, ?)
        `,
    [generateId(), eventId, now]
  );
}

export async function enqueueOutboxMedia(mediaId: string, localPath: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `
        insert into outbox_media (id, media_id, local_path, status, retry_count, last_error, created_at)
        values (?, ?, ?, 'pending', 0, null, ?)
        `,
    [generateId(), mediaId, localPath, now]
  );
}

export async function getPendingOutboxEvents(): Promise<
  {
    id: string;
    eventId: string;
    retryCount: number;
  }[]
> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    event_id: string;
    retry_count: number;
  }>(
    `
        select id, event_id, retry_count
          from outbox_events
         where status in ('pending', 'failed')
           and retry_count < ?
        `,
    [OUTBOX_MAX_RETRIES]
  );
  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    retryCount: row.retry_count,
  }));
}

export async function markOutboxEventFailed(
  outboxId: string,
  retryCount: number,
  error: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `
        update outbox_events
           set status = 'failed',
               retry_count = ?,
               last_error = ?
         where id = ?
        `,
    [retryCount, error, outboxId]
  );
}

export async function removeOutboxEvent(outboxId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from outbox_events where id = ?', [outboxId]);
}

export async function getEventById(eventId: string): Promise<AppEvent | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    user_id: string;
    session_id: string | null;
    problem_id: string | null;
    type: AppEvent['type'];
    payload_json: string;
    client_ts: string;
    server_ts: string | null;
  }>('select * from events where id = ?', [eventId]);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    problemId: row.problem_id,
    type: row.type,
    payloadJson: parseJson(row.payload_json, {}),
    clientTs: new Date(row.client_ts),
    serverTs: fromIso(row.server_ts),
  };
}

export async function getPendingOutboxMedia(): Promise<
  {
    id: string;
    mediaId: string;
    localPath: string;
    retryCount: number;
  }[]
> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    media_id: string;
    local_path: string;
    retry_count: number;
  }>(
    `
        select id, media_id, local_path, retry_count
          from outbox_media
         where status in ('pending', 'failed')
           and retry_count < ?
        `,
    [OUTBOX_MAX_RETRIES]
  );
  return rows.map((row) => ({
    id: row.id,
    mediaId: row.media_id,
    localPath: row.local_path,
    retryCount: row.retry_count,
  }));
}

export async function markOutboxMediaUploading(outboxId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("update outbox_media set status = 'uploading' where id = ?", [outboxId]);
}

export async function markOutboxMediaFailed(
  outboxId: string,
  retryCount: number,
  error: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `
        update outbox_media
           set status = 'failed',
               retry_count = ?,
               last_error = ?
         where id = ?
        `,
    [retryCount, error, outboxId]
  );
}

export async function removeOutboxMedia(outboxId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from outbox_media where id = ?', [outboxId]);
}
