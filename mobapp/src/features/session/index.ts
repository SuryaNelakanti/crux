/**
 * Session feature module
 * 
 * Handles session lifecycle:
 * - Start session
 * - Add problems to session
 * - End session
 * - View session history
 */

export {
    createSession,
    endSession,
    getSessionById,
    getSessionSummaries,
    type SessionSummary,
} from '@/lib/db';
