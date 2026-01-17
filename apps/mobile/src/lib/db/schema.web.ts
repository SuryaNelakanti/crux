import { generateId } from '@crux/shared';

// No-op for web to avoid "native module not found"
// In a real PWA this would use IndexedDB/SQL.js

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

// ... (schema definition omitted for brevity in web mock)
`;

export const toIso = (value: Date | null): string | null =>
    value ? value.toISOString() : null;

export const fromIso = (value: string | null): Date | null =>
    value ? new Date(value) : null;

export const parseJson = <T>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

const mockDb = {
    execAsync: async () => { },
    runAsync: async () => { },
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    closeAsync: async () => { },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDb(): Promise<any> {
    console.warn('SQLite is not supported on web. Using mock DB.');
    return mockDb;
}

export async function initDb(): Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
    localUserId: string;
}> {
    console.warn('SQLite is not supported on web. Using mock DB.');
    return { db: mockDb, localUserId: 'web-user-id' };
}

export async function getLocalUserId(): Promise<string> {
    return 'web-user-id';
}

export async function getSyncState(): Promise<{
    lastServerTs: Date | null;
    lastSyncAt: Date | null;
    localUserId: string | null;
}> {
    return { lastServerTs: null, lastSyncAt: null, localUserId: 'web-user-id' };
}

export async function updateSyncState(params: {
    lastServerTs: Date | null;
    lastSyncAt: Date | null;
}): Promise<void> { }
