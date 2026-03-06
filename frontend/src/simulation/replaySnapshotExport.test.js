import { describe, expect, it, vi } from 'vitest';

import {
  deriveReplaySnapshotBundle,
  downloadReplaySnapshotBundle,
  serializeReplaySnapshotBundle
} from './replaySnapshotExport';

describe('replaySnapshotExport', () => {
  it('builds byte-identical payloads for equivalent replay context at the same tick', () => {
    const source = {
      seed: 'seed-123',
      runMetadata: {
        tickCount: 42,
        speedMultiplier: '5x',
        snapshotId: 'sim-fixture'
      },
      replayTick: 42,
      replaySnapshotMetadata: {
        id: 'sim-fixture',
        name: 'Fixture snapshot',
        tickCount: 10,
        replayStartTick: 10,
        simulationParametersSignature: '{"worldWidth":800,"worldHeight":480}'
      },
      replayWorldState: {
        tick: 42,
        organisms: [{ id: 'org-1', x: 10, y: 20 }],
        food: [{ id: 'food-1', x: 12, y: 23 }]
      },
      currentReplayContext: {
        contextLabel: 'Context Match',
        contextDifferences: [],
        simulationParametersSignature: '{"worldWidth":800,"worldHeight":480}'
      }
    };

    const payloadA = serializeReplaySnapshotBundle(deriveReplaySnapshotBundle(source));
    const payloadB = serializeReplaySnapshotBundle(deriveReplaySnapshotBundle({ ...source }));

    expect(payloadA).toBe(payloadB);
    expect(payloadA).toContain('"seed":"seed-123"');
    expect(payloadA).toContain('"replayTick":42');
    expect(payloadA).toContain('"replayWorldStateHash"');
  });

  it('downloads serialized JSON with timestamped filename', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test-url');
    URL.revokeObjectURL = vi.fn(() => {});

    const click = vi.fn();
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      set href(value) {
        this._href = value;
      },
      set download(value) {
        this._download = value;
      }
    });

    const payload = downloadReplaySnapshotBundle(
      deriveReplaySnapshotBundle({
        seed: 'seed-x',
        runMetadata: { tickCount: 1, speedMultiplier: '1x', snapshotId: 'sim-1' },
        replayTick: 1,
        replaySnapshotMetadata: { id: 'sim-1', name: 'snap', tickCount: 1, replayStartTick: 1 },
        replayWorldState: { tick: 1, organisms: [], food: [] },
        currentReplayContext: { contextLabel: 'Context Match', contextDifferences: [], simulationParametersSignature: '{}' }
      }),
      new Date('2026-03-06T19:11:00.000Z')
    );

    expect(payload).toContain('"seed":"seed-x"');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    createElement.mockRestore();
  });
});
