import { describe, expect, it } from 'vitest';

import { deriveSimulationStats, formatSimulationStats } from './stats';

describe('simulation stats', () => {
  it('derives deterministic metrics from world state without mutation', () => {
    const world = {
      tick: 42,
      organisms: [
        { id: 'o-1', generation: 2, energy: 10.1234 },
        { id: 'o-2', generation: 4, energy: 20.9876 }
      ],
      food: [{ id: 'f-1' }, { id: 'f-2' }, { id: 'f-3' }]
    };

    const stats = deriveSimulationStats(world);

    expect(stats).toEqual({
      tickCount: 42,
      elapsedSeconds: 1.4,
      population: 2,
      foodCount: 3,
      averageGeneration: 3,
      averageEnergy: 15.5555
    });

    // Guard against accidental render-path mutation.
    expect(world.organisms[0].energy).toBe(10.1234);
    expect(world.food).toHaveLength(3);
  });

  it('formats stats with stable precision and zero-safe defaults', () => {
    const formatted = formatSimulationStats(
      deriveSimulationStats({
        tick: 0,
        organisms: [],
        food: []
      })
    );

    expect(formatted).toEqual({
      tickCount: '0',
      elapsedTime: '0.0s',
      population: '0',
      foodCount: '0',
      averageGeneration: '0.0',
      averageEnergy: '0.0'
    });
  });

  it('normalizes malformed numeric inputs into deterministic finite outputs', () => {
    const derived = deriveSimulationStats({
      tick: -12.7,
      organisms: [
        { id: 'o-1', generation: Number.NaN, energy: Infinity },
        { id: 'o-2', generation: 4.9, energy: -3.2 }
      ],
      food: [{ id: 'f-1' }]
    });

    expect(derived).toEqual({
      tickCount: 0,
      elapsedSeconds: 0,
      population: 2,
      foodCount: 1,
      averageGeneration: 2.45,
      averageEnergy: -1.6
    });

    expect(formatSimulationStats({
      tickCount: -1,
      elapsedSeconds: Number.NaN,
      population: -2,
      foodCount: 1.9,
      averageGeneration: Number.POSITIVE_INFINITY,
      averageEnergy: Number.NEGATIVE_INFINITY
    })).toEqual({
      tickCount: '0',
      elapsedTime: '0.0s',
      population: '0',
      foodCount: '1',
      averageGeneration: '0.0',
      averageEnergy: '0.0'
    });
  });
});
