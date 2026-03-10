import { describe, expect, it } from 'vitest';

import { buildReplayEventOrderTraceEntry, collectReplayEventOrderTrace, formatReplayEventOrderDiffSnippet } from './replayEventOrderTrace';

describe('replayEventOrderTrace', () => {
  it('builds a stable sorted per-tick orderedInteractionKeys artifact', () => {
    const previousWorldState = {
      tick: 4,
      organisms: [
        { id: 'organism-b', energy: 3 },
        { id: 'organism-a', energy: 4 }
      ]
    };

    const nextWorldState = {
      tick: 5,
      organisms: [
        { id: 'organism-c', energy: 8 },
        { id: 'organism-a', energy: 4 }
      ]
    };

    const entry = buildReplayEventOrderTraceEntry(previousWorldState, nextWorldState);

    expect(entry).toEqual({
      tick: 5,
      orderedInteractionKeys: [
        'birth:organism-c',
        'death:organism-b',
        'energyLeader:organism-a',
        'energyLeader:organism-c'
      ]
    });
  });

  it('collects identical traces for repeated runs with the same seed', () => {
    const baseWorldState = {
      tick: 0,
      organisms: [{ id: 'o-1', energy: 4 }],
      food: []
    };

    const createSeededPrng = () => ({ sequence: 0 });
    const stepWorld = (worldState, rng) => {
      const nextTick = Number(worldState.tick ?? 0) + 1;
      const nextEnergy = Number(worldState.organisms[0]?.energy ?? 0) + 1;
      const bornId = `o-born-${nextTick}`;
      rng.sequence += 1;
      return {
        tick: nextTick,
        organisms: [{ id: 'o-1', energy: nextEnergy }, { id: bornId, energy: rng.sequence }],
        food: []
      };
    };

    const traceA = collectReplayEventOrderTrace({ baseWorldState, seed: 'fixture-seed', tickBudget: 3, stepWorld, createSeededPrng });
    const traceB = collectReplayEventOrderTrace({ baseWorldState, seed: 'fixture-seed', tickBudget: 3, stepWorld, createSeededPrng });

    expect(traceA).toEqual(traceB);
  });

  it('prints concise mismatch snippets for parity failures', () => {
    const snippet = formatReplayEventOrderDiffSnippet(
      [{ tick: 8, orderedInteractionKeys: ['birth:o-1', 'energyLeader:o-1'] }],
      [{ tick: 8, orderedInteractionKeys: ['birth:o-2', 'energyLeader:o-2'] }]
    );

    expect(snippet).toContain('Per-tick event ordering diff snippet');
    expect(snippet).toContain('tick=8');
    expect(snippet).toContain('expected=["birth:o-1","energyLeader:o-1"]');
    expect(snippet).toContain('actual=["birth:o-2","energyLeader:o-2"]');
  });
});
