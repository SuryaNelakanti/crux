import type { AppEvent } from '@crux/shared';
import { flushOutboxEvents } from './outbox';

const baseEvent: AppEvent = {
  id: 'event-1',
  userId: 'user-1',
  sessionId: null,
  problemId: null,
  type: 'session_started',
  payloadJson: { sessionId: 'session-1' },
  clientTs: new Date('2026-01-01T00:00:00.000Z'),
  serverTs: null,
};

describe('flushOutboxEvents', () => {
  it('inserts events and removes outbox items', async () => {
    const deps = {
      getPendingOutboxEvents: jest
        .fn()
        .mockResolvedValue([{ id: 'outbox-1', eventId: 'event-1', retryCount: 0 }]),
      getEventById: jest.fn().mockResolvedValue(baseEvent),
      insertEvents: jest.fn().mockResolvedValue(undefined),
      removeOutboxEvent: jest.fn().mockResolvedValue(undefined),
      markOutboxEventFailed: jest.fn().mockResolvedValue(undefined),
    };

    await flushOutboxEvents(deps);

    expect(deps.insertEvents).toHaveBeenCalledWith([baseEvent]);
    expect(deps.removeOutboxEvent).toHaveBeenCalledWith('outbox-1');
    expect(deps.markOutboxEventFailed).not.toHaveBeenCalled();
  });

  it('marks failures with incremented retry count', async () => {
    const deps = {
      getPendingOutboxEvents: jest
        .fn()
        .mockResolvedValue([{ id: 'outbox-2', eventId: 'event-1', retryCount: 2 }]),
      getEventById: jest.fn().mockResolvedValue(baseEvent),
      insertEvents: jest.fn().mockRejectedValue(new Error('boom')),
      removeOutboxEvent: jest.fn().mockResolvedValue(undefined),
      markOutboxEventFailed: jest.fn().mockResolvedValue(undefined),
    };

    await flushOutboxEvents(deps);

    expect(deps.markOutboxEventFailed).toHaveBeenCalledWith('outbox-2', 3, 'boom');
  });

  it('drops items with missing events', async () => {
    const deps = {
      getPendingOutboxEvents: jest
        .fn()
        .mockResolvedValue([{ id: 'outbox-3', eventId: 'missing', retryCount: 0 }]),
      getEventById: jest.fn().mockResolvedValue(null),
      insertEvents: jest.fn().mockResolvedValue(undefined),
      removeOutboxEvent: jest.fn().mockResolvedValue(undefined),
      markOutboxEventFailed: jest.fn().mockResolvedValue(undefined),
    };

    await flushOutboxEvents(deps);

    expect(deps.removeOutboxEvent).toHaveBeenCalledWith('outbox-3');
    expect(deps.insertEvents).not.toHaveBeenCalled();
  });
});
