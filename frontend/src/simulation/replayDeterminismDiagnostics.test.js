import { describe, expect, it } from 'vitest';

import {
  assertReplayDeterminismMatch,
  buildReplayDeterminismFingerprint,
  buildReplayDeterminismSnapshot,
  formatReplayDeterminismMismatchContext,
  locateFirstDivergenceTick
} from './replayDeterminismDiagnostics';

describe('replayDeterminismDiagnostics', () => {
  it('builds deterministic snapshots and fingerprints independent of organism array order', () => {
    const worldA = {
      tick: 42,
      organisms: [
        { id: 'b', x: 2.1234567, y: 4.7654321, energy: 9.3333333 },
        { id: 'a', x: 1.1111111, y: 3.2222222, energy: 8.4444444 }
      ],
      food: [{ id: 'f1' }, { id: 'f2' }]
    };

    const worldB = {
      ...worldA,
      organisms: [...worldA.organisms].reverse()
    };

    expect(buildReplayDeterminismSnapshot(worldA)).toEqual(buildReplayDeterminismSnapshot(worldB));
    expect(buildReplayDeterminismFingerprint(worldA)).toBe(buildReplayDeterminismFingerprint(worldB));
  });

  it('formats stable mismatch context with required deterministic fields', () => {
    const actualWorld = {
      tick: 10,
      organisms: [{ id: 'a', x: 1, y: 2, energy: 3 }],
      food: [{ id: 'f1' }]
    };
    const expectedWorld = {
      tick: 11,
      organisms: [{ id: 'a', x: 1, y: 2.5, energy: 3 }],
      food: []
    };

    const actualFingerprint = buildReplayDeterminismFingerprint(actualWorld);
    const expectedFingerprint = buildReplayDeterminismFingerprint(expectedWorld);

    const context = formatReplayDeterminismMismatchContext({
      contextLabel: 'fixture=test',
      seed: 'seed-1',
      stepParams: { worldWidth: 800, worldHeight: 480, mutationRate: 0.1 },
      actualWorldState: actualWorld,
      expectedWorldState: expectedWorld,
      actualFingerprint,
      expectedFingerprint
    });

    expect(context).toContain('"seed":"seed-1"');
    expect(context).toContain('"paramsHash":"');
    expect(context).toContain('"tick":10');
    expect(context).toContain('"populationCount":1');
    expect(context).toContain('"foodCount":1');
    expect(context).toContain('"fingerprintHead":"');
    expect(context).toContain('"fingerprintTail":"');
  });

  it('throws with structured context when fingerprints mismatch', () => {
    const worldA = { tick: 1, organisms: [{ id: 'a', x: 1, y: 1, energy: 1 }], food: [] };
    const worldB = { tick: 2, organisms: [{ id: 'a', x: 2, y: 1, energy: 1 }], food: [] };

    expect(() =>
      assertReplayDeterminismMatch({
        contextLabel: 'fixture=mismatch',
        seed: 'seed-2',
        stepParams: { worldWidth: 640, worldHeight: 360 },
        actualWorldState: worldA,
        expectedWorldState: worldB,
        actualFingerprint: buildReplayDeterminismFingerprint(worldA),
        expectedFingerprint: buildReplayDeterminismFingerprint(worldB)
      })
    ).toThrow(/Determinism fingerprint mismatch\n\{\"actual\":\{\"fingerprintHead\":/);
  });

  it('returns null when no divergence is detected within max tick budget', () => {
    const getWorldAtTick = (tick) => ({ tick, organisms: [{ id: 'org-a', x: tick, y: 0, energy: 5 }], food: [] });

    const firstDivergenceTick = locateFirstDivergenceTick({
      maxTick: 120,
      checkpointInterval: 20,
      getExpectedWorldStateAtTick: getWorldAtTick,
      getActualWorldStateAtTick: getWorldAtTick
    });

    expect(firstDivergenceTick).toBeNull();
  });

  it('pinpoints an early divergence tick via checkpoint scan and binary narrowing', () => {
    const divergenceTick = 3;
    const getExpectedWorldStateAtTick = (tick) => ({ tick, organisms: [{ id: 'org-a', x: tick, y: 0, energy: 5 }], food: [] });
    const getActualWorldStateAtTick = (tick) => ({
      tick,
      organisms: [{ id: 'org-a', x: tick, y: 0, energy: tick >= divergenceTick ? 7 : 5 }],
      food: []
    });

    const firstDivergenceTick = locateFirstDivergenceTick({
      maxTick: 40,
      checkpointInterval: 10,
      getExpectedWorldStateAtTick,
      getActualWorldStateAtTick
    });

    expect(firstDivergenceTick).toBe(divergenceTick);
  });

  it('pinpoints a late divergence tick near the max tick budget', () => {
    const divergenceTick = 97;
    const getExpectedWorldStateAtTick = (tick) => ({ tick, organisms: [{ id: 'org-a', x: tick, y: 0, energy: 5 }], food: [] });
    const getActualWorldStateAtTick = (tick) => ({
      tick,
      organisms: [{ id: 'org-a', x: tick, y: 0, energy: tick >= divergenceTick ? 6 : 5 }],
      food: []
    });

    const firstDivergenceTick = locateFirstDivergenceTick({
      maxTick: 120,
      checkpointInterval: 25,
      getExpectedWorldStateAtTick,
      getActualWorldStateAtTick
    });

    expect(firstDivergenceTick).toBe(divergenceTick);
  });
});
