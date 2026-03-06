import { describe, expect, it } from 'vitest';

import { deriveRunMetadata, NO_SNAPSHOT_ID, serializeRunMetadata } from './metadata';

describe('run metadata', () => {
  it('maps deterministic simulation values with stable snapshot fallback', () => {
    expect(
      deriveRunMetadata({
        resolvedSeed: 'seed-123',
        tickCount: 42,
        speedMultiplier: 5,
        snapshotId: ''
      })
    ).toEqual({
      seed: 'seed-123',
      tickCount: 42,
      speedMultiplier: '5x',
      snapshotId: NO_SNAPSHOT_ID
    });
  });

  it('serializes metadata in stable key order', () => {
    const metadata = deriveRunMetadata({
      resolvedSeed: 'seed-abc',
      tickCount: 9,
      speedMultiplier: 2,
      snapshotId: 'sim-9'
    });

    expect(serializeRunMetadata(metadata)).toBe(
      '{"seed":"seed-abc","tickCount":9,"speedMultiplier":"2x","snapshotId":"sim-9"}'
    );
  });
});
