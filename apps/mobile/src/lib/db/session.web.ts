import { generateId, type Session } from '@crux/shared';
import { webStore } from './webStore';

export interface SessionSummary {
    id: string;
    startTs: Date;
    endTs: Date | null;
    problemCount: number;
    sendCount: number;
    flashCount: number;
}

export async function createSession(
    gymLabel: string | null = null
): Promise<Session> {
    const now = new Date();
    const session: Session = {
        id: generateId(),
        userId: 'web-user-id',
        startTs: now,
        endTs: null,
        gymLabel,
        createdAt: now,
    };
    webStore.sessions.unshift(session);
    return session;
}

export async function endSession(sessionId: string): Promise<void> {
    const session = webStore.sessions.find((entry) => entry.id === sessionId);
    if (session) {
        session.endTs = new Date();
    }
}

export async function getSessionSummaries(): Promise<SessionSummary[]> {
    return webStore.sessions.map((session) => {
        const problems = webStore.problems.filter(
            (problem) => problem.createdInSessionId === session.id
        );
        const logs = webStore.logs.filter(
            (log) => log.sessionId === session.id
        );
        const sendCount = logs.filter((log) => log.outcome === 'send').length;
        const flashCount = logs.filter((log) => log.outcome === 'flash').length;

        return {
            id: session.id,
            startTs: session.startTs,
            endTs: session.endTs,
            problemCount: problems.length,
            sendCount,
            flashCount,
        };
    });
}

export async function getSessionById(
    sessionId: string
): Promise<Session | null> {
    return webStore.sessions.find((entry) => entry.id === sessionId) ?? null;
}
