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
  type Database,
  getClient,
  resetClient,
  type SupabaseClient,
} from './client';
// Database
export {
  insertEvents,
  joinProblemWithToken,
  resolveProblemShareToken,
  upsertMedia,
  upsertProblemMembers,
  upsertProblems,
  upsertRouteMasks,
  upsertSessions,
  upsertUserProblemLogs,
  upsertUsers,
} from './db';
// Storage
export {
  deleteMask,
  deletePhoto,
  getMaskSignedUrl,
  getPhotoSignedUrl,
  type UploadResult,
  uploadMask,
  uploadPhoto,
} from './storage';
