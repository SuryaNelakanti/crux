import { RouteMaskCreatedPayloadSchema, RouteMaskSchema } from './index';

const id = '11111111-1111-4111-8111-111111111111';

describe('route mask schemas', () => {
  it('accepts combo ML route-mask metadata', () => {
    expect(
      RouteMaskSchema.parse({
        id,
        problemId: '22222222-2222-4222-8222-222222222222',
        version: 1,
        maskMediaId: '33333333-3333-4333-8333-333333333333',
        method: 'ml-combo-v1',
        seedColorJson: null,
        confidence: 0.81,
        metadataJson: {
          modelHash: 'f'.repeat(64),
          proposalCount: 120,
          selectedRouteCandidateId: 4,
        },
        createdBy: '44444444-4444-4444-8444-444444444444',
        createdAt: '2026-05-24T09:30:00.000Z',
      })
    ).toMatchObject({
      method: 'ml-combo-v1',
      metadataJson: {
        proposalCount: 120,
      },
    });
  });

  it('allows route-mask created events to carry metadata', () => {
    expect(
      RouteMaskCreatedPayloadSchema.parse({
        problemId: '22222222-2222-4222-8222-222222222222',
        routeMaskId: id,
        method: 'ml-yolo26-seg',
        confidence: 0.76,
        metadataJson: { modelHash: 'e'.repeat(64) },
      })
    ).toMatchObject({
      method: 'ml-yolo26-seg',
      metadataJson: { modelHash: 'e'.repeat(64) },
    });
  });
});
