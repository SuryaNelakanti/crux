/**
 * @crux/supabase-client
 * 
 * Typed Supabase API boundary for Crux app.
 * All database and storage operations go through this package.
 * 
 * Rules:
 * - No UI logic
 * - All operations return typed results
 * - Storage uses deterministic paths
 */

// Client
export {
    createClient,
    getClient,
    resetClient,
    type SupabaseClient,
    type Database,
} from './client';

// Storage
export {
    uploadPhoto,
    uploadMask,
    getPhotoSignedUrl,
    getMaskSignedUrl,
    deletePhoto,
    deleteMask,
    type UploadResult,
} from './storage';

// Database
export {
    upsertUsers,
    upsertSessions,
    upsertProblems,
    upsertProblemMembers,
    upsertMedia,
    upsertRouteMasks,
    upsertUserProblemLogs,
    insertEvents,
    resolveProblemShareToken,
    joinProblemWithToken,
} from './db';
