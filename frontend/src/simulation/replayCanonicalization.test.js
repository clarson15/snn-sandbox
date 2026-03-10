import { describe, expect, it } from 'vitest';

import { canonicalizeReplayFixturePayload, stableCanonicalStringify } from './replayCanonicalization';

describe('replayCanonicalization', () => {
  it('produces stable output for equivalent objects with different key insertion order', () => {
    const left = {
      seed: 'fixture-seed',
      params: {
        worldHeight: 480,
        worldWidth: 800,
        mutationRate: 0.08
      },
      replay: {
        tick: 120,
        values: [
          { id: 'a', energy: 10.1234567891234, x: -0 },
          { id: 'b', energy: 5.2, x: 42 }
        ]
      }
    };

    const right = {
      replay: {
        values: [
          { x: 0, energy: 10.1234567891234, id: 'a' },
          { energy: 5.2, id: 'b', x: 42 }
        ],
        tick: 120
      },
      params: {
        mutationRate: 0.08,
        worldWidth: 800,
        worldHeight: 480
      },
      seed: 'fixture-seed'
    };

    expect(stableCanonicalStringify(left)).toBe(stableCanonicalStringify(right));
    expect(canonicalizeReplayFixturePayload(left)).toEqual(canonicalizeReplayFixturePayload(right));
  });
});
