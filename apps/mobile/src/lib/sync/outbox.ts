import type { AppEvent } from '@crux/shared';

export interface OutboxEventDeps {
    getPendingOutboxEvents: () => Promise<
        { id: string; eventId: string; retryCount: number }[]
    >;
    getEventById: (eventId: string) => Promise<AppEvent | null>;
    insertEvents: (events: AppEvent[]) => Promise<void>;
    removeOutboxEvent: (outboxId: string) => Promise<void>;
    markOutboxEventFailed: (
        outboxId: string,
        retryCount: number,
        error: string
    ) => Promise<void>;
}

export async function flushOutboxEvents(
    deps: OutboxEventDeps
): Promise<void> {
    const items = await deps.getPendingOutboxEvents();
    for (const item of items) {
        try {
            const event = await deps.getEventById(item.eventId);
            if (!event) {
                await deps.removeOutboxEvent(item.id);
                continue;
            }
            await deps.insertEvents([event]);
            await deps.removeOutboxEvent(item.id);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'event flush failed';
            await deps.markOutboxEventFailed(
                item.id,
                item.retryCount + 1,
                message
            );
        }
    }
}
