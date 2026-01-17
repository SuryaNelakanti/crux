import { getDb } from './schema';

export async function getMediaById(
    mediaId: string
): Promise<{
    id: string;
    problemId: string;
    type: 'photo' | 'mask';
    localPath: string | null;
} | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{
        id: string;
        problem_id: string;
        type: 'photo' | 'mask';
        local_path: string | null;
    }>('select id, problem_id, type, local_path from media where id = ?', [
        mediaId,
    ]);
    if (!row) return null;
    return {
        id: row.id,
        problemId: row.problem_id,
        type: row.type,
        localPath: row.local_path,
    };
}

export async function updateMediaStoragePath(
    mediaId: string,
    storagePath: string
): Promise<void> {
    const db = await getDb();
    await db.runAsync('update media set storage_path = ? where id = ?', [
        storagePath,
        mediaId,
    ]);
}
