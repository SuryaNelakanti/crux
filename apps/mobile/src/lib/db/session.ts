import { generateId, type Session } from '@crux/shared';
import { appendEvent } from './outbox';
import { fromIso, getDb, initDb } from './schema';

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
    const { db, localUserId } = await initDb();
    const now = new Date();
    const session: Session = {
        id: generateId(),
        userId: localUserId,
        startTs: now,
        endTs: null,
        gymLabel,
        createdAt: now,
    };

    await db.runAsync(
        'insert into sessions (id, user_id, start_ts, end_ts, gym_label, created_at) values (?, ?, ?, ?, ?, ?)',
        [
            session.id,
            session.userId,
            session.startTs.toISOString(),
            null,
            session.gymLabel,
            session.createdAt.toISOString(),
        ]
    );

    await appendEvent({
        type: 'session_started',
        userId: localUserId,
        sessionId: session.id,
        problemId: null,
        payloadJson: { sessionId: session.id, gymLabel: session.gymLabel },
    });

    return session;
}

export async function endSession(sessionId: string): Promise<void> {
    const { db, localUserId } = await initDb();
    const now = new Date();

    await db.runAsync('update sessions set end_ts = ? where id = ?', [
        now.toISOString(),
        sessionId,
    ]);

    await appendEvent({
        type: 'session_ended',
        userId: localUserId,
        sessionId,
        problemId: null,
        payloadJson: { sessionId },
    });
}

export async function getSessionSummaries(): Promise<SessionSummary[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{
        id: string;
        start_ts: string;
        end_ts: string | null;
        problem_count: number;
        send_count: number;
        flash_count: number;
    }>(
        `
        select
            s.id,
            s.start_ts,
            s.end_ts,
            count(p.id) as problem_count,
            sum(case when l.outcome = 'send' then 1 else 0 end) as send_count,
            sum(case when l.outcome = 'flash' then 1 else 0 end) as flash_count
        from sessions s
        left join problems p on p.created_in_session_id = s.id
        left join user_problem_logs l on l.problem_id = p.id
        group by s.id
        order by s.start_ts desc
        `
    );

    return rows.map((row) => ({
        id: row.id,
        startTs: new Date(row.start_ts),
        endTs: fromIso(row.end_ts),
        problemCount: row.problem_count ?? 0,
        sendCount: row.send_count ?? 0,
        flashCount: row.flash_count ?? 0,
    }));
}

export async function getSessionById(
    sessionId: string
): Promise<Session | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{
        id: string;
        user_id: string;
        start_ts: string;
        end_ts: string | null;
        gym_label: string | null;
        created_at: string;
    }>('select * from sessions where id = ?', [sessionId]);

    if (!row) return null;

    return {
        id: row.id,
        userId: row.user_id,
        startTs: new Date(row.start_ts),
        endTs: fromIso(row.end_ts),
        gymLabel: row.gym_label,
        createdAt: new Date(row.created_at),
    };
}
