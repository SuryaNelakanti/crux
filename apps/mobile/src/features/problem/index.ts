/**
 * Problem feature module
 * 
 * Handles problem capture and logging:
 * - Take photo
 * - View/edit mask
 * - Log outcome
 * - Set grade/attempts
 */

export {
    createProblemFromPhoto,
    getProblemById,
    getProblemCardsForSession,
    getUserProblemLog,
    upsertUserProblemLog,
    type ProblemCardItem,
} from '@/lib/db';
