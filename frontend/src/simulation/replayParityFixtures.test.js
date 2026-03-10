import { describe, expect, it } from 'vitest';

import { REPLAY_PARITY_FIXTURES, REPLAY_PROFILE_MATRIX, resolveReplayParityFixtures } from './replayParityFixtures';

describe('replayParityFixtures', () => {
  it('covers the core deterministic profile matrix with explicit fixed seeds', () => {
    const profiles = new Set(REPLAY_PARITY_FIXTURES.map((fixture) => fixture.profile));

    expect(profiles.has(REPLAY_PROFILE_MATRIX.sparseFood.id)).toBe(true);
    expect(profiles.has(REPLAY_PROFILE_MATRIX.denseFood.id)).toBe(true);
    expect(profiles.has(REPLAY_PROFILE_MATRIX.reproductionPressure.id)).toBe(true);

    for (const fixture of REPLAY_PARITY_FIXTURES) {
      expect(typeof fixture.seed).toBe('string');
      expect(fixture.seed.length).toBeGreaterThan(0);
    }
  });

  it('supports focused local subset selection by fixture name and profile id', () => {
    const byName = resolveReplayParityFixtures({ fixtureNames: ['baseline-smoke'] });
    expect(byName).toHaveLength(1);
    expect(byName[0].name).toBe('baseline-smoke');

    const byProfile = resolveReplayParityFixtures({ profileIds: [REPLAY_PROFILE_MATRIX.denseFood.id] });
    expect(byProfile.length).toBeGreaterThan(0);
    expect(byProfile.every((fixture) => fixture.profile === REPLAY_PROFILE_MATRIX.denseFood.id)).toBe(true);
  });
});
