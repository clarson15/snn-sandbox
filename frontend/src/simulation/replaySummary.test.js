import { describe, expect, it } from 'vitest';

import { deriveReplaySummaryStrip, deriveSimulationParametersSignature } from './replaySummary';

describe('deriveReplaySummaryStrip', () => {
  it('maps replay metadata into deterministic summary values with context match', () => {
    const parametersSignature = deriveSimulationParametersSignature({
      worldWidth: 800,
      worldHeight: 480,
      initialPopulation: 12,
      initialFoodCount: 30,
      foodSpawnChance: 0.04,
      foodEnergyValue: 5,
      maxFood: 120
    });

    expect(
      deriveReplaySummaryStrip({
        replaySnapshotMetadata: {
          id: 'sim-123',
          name: 'Fixture snapshot',
          seed: 'fixture-seed',
          tickCount: 10,
          replayStartTick: 10,
          simulationParametersSignature: parametersSignature
        },
        replayTick: 42,
        currentReplayContext: {
          seed: 'fixture-seed',
          replayStartTick: 10,
          simulationParametersSignature: parametersSignature
        }
      })
    ).toEqual({
      seed: 'fixture-seed',
      simulationName: 'Fixture snapshot',
      simulationId: 'sim-123',
      startTick: 10,
      endTick: 42,
      durationTicks: 32,
      firstMismatchTick: null,
      mismatchDetected: false,
      canJumpToFirstMismatch: false,
      contextLabel: 'Context Match',
      contextDifferences: []
    });
  });

  it('returns context mismatch with only differing deterministic field names', () => {
    expect(
      deriveReplaySummaryStrip({
        replaySnapshotMetadata: {
          id: 'sim-123',
          name: 'Fixture snapshot',
          seed: 'fixture-seed',
          tickCount: 10,
          replayStartTick: 10,
          simulationParametersSignature: 'sig-a'
        },
        replayTick: 10,
        currentReplayContext: {
          seed: 'fixture-seed',
          replayStartTick: 14,
          simulationParametersSignature: 'sig-b'
        }
      })
    ).toEqual({
      seed: 'fixture-seed',
      simulationName: 'Fixture snapshot',
      simulationId: 'sim-123',
      startTick: 10,
      endTick: 10,
      durationTicks: 0,
      firstMismatchTick: null,
      mismatchDetected: true,
      canJumpToFirstMismatch: false,
      contextLabel: 'Context Mismatch',
      contextDifferences: ['replayStartTick', 'simulationParameters']
    });
  });

  it('renders explicit fallback values when metadata is missing', () => {
    expect(
      deriveReplaySummaryStrip({
        replaySnapshotMetadata: {
          id: '',
          name: '',
          seed: '',
          tickCount: null
        },
        replayTick: null,
        currentReplayContext: {
          seed: 'fixture-seed',
          replayStartTick: 0,
          simulationParametersSignature: 'sig-a'
        }
      })
    ).toEqual({
      seed: 'Unknown seed',
      simulationName: 'Unknown simulation',
      simulationId: 'Unknown simulation ID',
      startTick: 'Unknown tick',
      endTick: 'Unknown tick',
      durationTicks: 'Unknown duration',
      firstMismatchTick: null,
      mismatchDetected: true,
      canJumpToFirstMismatch: false,
      contextLabel: 'Context Mismatch',
      contextDifferences: ['seed', 'replayStartTick', 'simulationParameters']
    });
  });

  it('enables first-mismatch jump only when deterministic mismatch location is available', () => {
    expect(
      deriveReplaySummaryStrip({
        replaySnapshotMetadata: {
          id: 'sim-123',
          name: 'Fixture snapshot',
          seed: 'fixture-seed',
          tickCount: 10,
          mismatchDetected: true,
          firstMismatchTick: 26,
          simulationParametersSignature: 'sig-a'
        },
        replayTick: 18,
        currentReplayContext: {
          seed: 'fixture-seed',
          replayStartTick: 10,
          simulationParametersSignature: 'sig-a'
        }
      })
    ).toMatchObject({
      firstMismatchTick: 26,
      mismatchDetected: true,
      canJumpToFirstMismatch: true
    });

    expect(
      deriveReplaySummaryStrip({
        replaySnapshotMetadata: {
          id: 'sim-123',
          name: 'Fixture snapshot',
          seed: 'fixture-seed',
          tickCount: 10,
          comparison: {
            mismatchDetected: true
          },
          simulationParametersSignature: 'sig-a'
        },
        replayTick: 18,
        currentReplayContext: {
          seed: 'fixture-seed',
          replayStartTick: 10,
          simulationParametersSignature: 'sig-a'
        }
      })
    ).toMatchObject({
      firstMismatchTick: null,
      mismatchDetected: true,
      canJumpToFirstMismatch: false
    });
  });
});
