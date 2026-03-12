import { describe, expect, it } from 'vitest';

import {
  deriveSimulationStats,
  deriveStatsTrends,
  formatSimulationStats,
  formatTrendIndicator,
  reduceStatsTrendHistory,
  STATS_TREND_DIRECTIONS,
  STATS_TREND_WINDOW_TICKS
} from './stats';

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
      averageEnergy: 15.5555,
      speciesCount: 1,
      energyDeathWarning: false
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
      tickCount: '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A00',
      elapsedTime: '0.0s',
      population: '0',
      foodCount: '0',
      averageGeneration: '0.0',
      averageEnergy: '0.0',
      speciesCount: '0',
      energyDeathWarning: false
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
      averageEnergy: -1.6,
      speciesCount: 1,
      energyDeathWarning: false
    });

    expect(formatSimulationStats({
      tickCount: -1,
      elapsedSeconds: Number.NaN,
      population: -2,
      foodCount: 1.9,
      averageGeneration: Number.POSITIVE_INFINITY,
      averageEnergy: Number.NEGATIVE_INFINITY,
      speciesCount: -1,
      energyDeathWarning: false
    })).toEqual({
      tickCount: '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A00',
      elapsedTime: '0.0s',
      population: '0',
      foodCount: '1',
      averageGeneration: '0.0',
      averageEnergy: '0.0',
      speciesCount: '0',
      energyDeathWarning: false
    });
  });

  it('returns flat trends when there is insufficient history for the fixed tick window', () => {
    const history = [
      { tick: 0, population: 3, averageEnergy: 5 },
      { tick: STATS_TREND_WINDOW_TICKS - 1, population: 10, averageEnergy: 15 }
    ];

    expect(deriveStatsTrends(history, STATS_TREND_WINDOW_TICKS - 1)).toEqual({
      population: STATS_TREND_DIRECTIONS.FLAT,
      averageEnergy: STATS_TREND_DIRECTIONS.FLAT
    });
  });

  it('derives deterministic up/down/flat trends from fixed-window deltas', () => {
    const upHistory = [
      { tick: 0, population: 3, averageEnergy: 5.0 },
      { tick: STATS_TREND_WINDOW_TICKS, population: 7, averageEnergy: 6.2 }
    ];
    expect(deriveStatsTrends(upHistory, STATS_TREND_WINDOW_TICKS)).toEqual({
      population: STATS_TREND_DIRECTIONS.UP,
      averageEnergy: STATS_TREND_DIRECTIONS.UP
    });

    const downHistory = [
      { tick: 0, population: 7, averageEnergy: 6.0 },
      { tick: STATS_TREND_WINDOW_TICKS, population: 4, averageEnergy: 5.1 }
    ];
    expect(deriveStatsTrends(downHistory, STATS_TREND_WINDOW_TICKS)).toEqual({
      population: STATS_TREND_DIRECTIONS.DOWN,
      averageEnergy: STATS_TREND_DIRECTIONS.DOWN
    });

    const flatHistory = [
      { tick: 0, population: 4, averageEnergy: 5.0 },
      { tick: STATS_TREND_WINDOW_TICKS, population: 4, averageEnergy: 5.05 }
    ];
    expect(deriveStatsTrends(flatHistory, STATS_TREND_WINDOW_TICKS)).toEqual({
      population: STATS_TREND_DIRECTIONS.FLAT,
      averageEnergy: STATS_TREND_DIRECTIONS.FLAT
    });
  });

  it('keeps a deterministic bounded history and resets when tick count rewinds', () => {
    const history = [
      { tick: 120, population: 5, averageEnergy: 4 },
      { tick: 130, population: 6, averageEnergy: 5 }
    ];

    expect(reduceStatsTrendHistory(history, { tickCount: 10, population: 1, averageEnergy: 2 })).toEqual([
      { tick: 10, population: 1, averageEnergy: 2 }
    ]);
  });

  it('maps trend states to stable UI labels', () => {
    expect(formatTrendIndicator(STATS_TREND_DIRECTIONS.UP)).toBe('↑ Up');
    expect(formatTrendIndicator(STATS_TREND_DIRECTIONS.DOWN)).toBe('↓ Down');
    expect(formatTrendIndicator(STATS_TREND_DIRECTIONS.FLAT)).toBe('→ Flat');
  });

  it('clusters organisms into species based on genetic distance', () => {
    // Two organisms with identical traits = 1 species
    const identicalOrganisms = {
      tick: 10,
      organisms: [
        { id: 'o-1', traits: { size: 1, speed: 1, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } },
        { id: 'o-2', traits: { size: 1, speed: 1, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } }
      ],
      food: []
    };
    expect(deriveSimulationStats(identicalOrganisms).speciesCount).toBe(1);

    // Two organisms with very different traits = 2 species
    const differentOrganisms = {
      tick: 10,
      organisms: [
        { id: 'o-1', traits: { size: 1, speed: 1, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } },
        { id: 'o-2', traits: { size: 5, speed: 5, visionRange: 20, turnRate: 1, metabolism: 1 } }
      ],
      food: []
    };
    expect(deriveSimulationStats(differentOrganisms).speciesCount).toBe(2);

    // Chain of similar organisms = 1 species (connected components)
    const chainOrganisms = {
      tick: 10,
      organisms: [
        { id: 'o-1', traits: { size: 1, speed: 1, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } },
        { id: 'o-2', traits: { size: 1.1, speed: 1.1, visionRange: 5.1, turnRate: 0.51, metabolism: 0.11 } },
        { id: 'o-3', traits: { size: 1.2, speed: 1.2, visionRange: 5.2, turnRate: 0.52, metabolism: 0.12 } }
      ],
      food: []
    };
    expect(deriveSimulationStats(chainOrganisms).speciesCount).toBe(1);

    // Empty population
    expect(deriveSimulationStats({ tick: 0, organisms: [], food: [] }).speciesCount).toBe(0);

    // Single organism
    expect(deriveSimulationStats({ tick: 0, organisms: [{ id: 'o-1' }], food: [] }).speciesCount).toBe(1);
  });
});
