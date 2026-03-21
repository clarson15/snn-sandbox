import { describe, expect, it } from 'vitest';

import {
  deriveReplaySummaryStrip,
  deriveSimulationParametersSignature,
  filterMismatchEvents,
  formatMismatchDisplayValue
} from './replaySummary';

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
          simulationVersion: 'snn-sandbox-v1',
          tickCount: 10,
          replayStartTick: 10,
          simulationParametersSignature: parametersSignature
        },
        replayTick: 42,
        currentReplayContext: {
          seed: 'fixture-seed',
          simulationVersion: 'snn-sandbox-v1',
          replayStartTick: 10,
          simulationParametersSignature: parametersSignature
        }
      })
    ).toEqual({
      seed: 'fixture-seed',
      simulationVersion: 'snn-sandbox-v1',
      parameterFingerprint: parametersSignature,
      simulationName: 'Fixture snapshot',
      simulationId: 'sim-123',
      startTick: 10,
      endTick: 42,
      durationTicks: 32,
      firstMismatchTick: null,
      mismatchDetected: false,
      mismatchDetails: null,
      mismatchEvents: [],
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
          simulationVersion: 'snn-sandbox-v1',
          tickCount: 10,
          replayStartTick: 10,
          simulationParametersSignature: 'sig-a'
        },
        replayTick: 10,
        currentReplayContext: {
          seed: 'fixture-seed',
          simulationVersion: 'snn-sandbox-v1',
          replayStartTick: 14,
          simulationParametersSignature: 'sig-b'
        }
      })
    ).toEqual({
      seed: 'fixture-seed',
      simulationVersion: 'snn-sandbox-v1',
      parameterFingerprint: 'sig-a',
      simulationName: 'Fixture snapshot',
      simulationId: 'sim-123',
      startTick: 10,
      endTick: 10,
      durationTicks: 0,
      firstMismatchTick: null,
      mismatchDetected: true,
      mismatchDetails: null,
      mismatchEvents: [],
      canJumpToFirstMismatch: false,
      contextLabel: 'Context Mismatch',
      contextDifferences: ['Replay start tick', 'Simulation parameters']
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
      simulationVersion: 'Unknown version',
      parameterFingerprint: 'Unknown fingerprint',
      simulationName: 'Unknown simulation',
      simulationId: 'Unknown simulation ID',
      startTick: 'Unknown tick',
      endTick: 'Unknown tick',
      durationTicks: 'Unknown duration',
      firstMismatchTick: null,
      mismatchDetected: true,
      mismatchDetails: null,
      mismatchEvents: [],
      canJumpToFirstMismatch: false,
      contextLabel: 'Context Mismatch',
      contextDifferences: ['Seed', 'Replay start tick', 'Simulation parameters']
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

  it('derives mismatch details payload with absolute delta from replay snapshot metadata only', () => {
    expect(
      deriveReplaySummaryStrip({
        replaySnapshotMetadata: {
          id: 'sim-123',
          name: 'Fixture snapshot',
          seed: 'fixture-seed',
          tickCount: 10,
          comparison: {
            mismatchDetected: true,
            firstMismatchTick: 26,
            firstMismatch: {
              entityId: 'org-4',
              path: 'organisms[4].energy',
              baselineValue: 8.5,
              comparisonValue: 9
            }
          },
          simulationParametersSignature: 'sig-a'
        },
        replayTick: 26,
        currentReplayContext: {
          seed: 'fixture-seed',
          replayStartTick: 10,
          simulationParametersSignature: 'sig-a'
        }
      }).mismatchDetails
    ).toEqual({
      tick: 26,
      path: 'organisms[4].energy',
      entityId: 'org-4',
      baselineValue: 8.5,
      comparisonValue: 9,
      absoluteDelta: 0.5
    });
  });

  it('derives stable mismatch events ordered by tick then payload order', () => {
    const summary = deriveReplaySummaryStrip({
      replaySnapshotMetadata: {
        id: 'sim-123',
        name: 'Fixture snapshot',
        seed: 'fixture-seed',
        tickCount: 10,
        comparison: {
          mismatchDetected: true,
          mismatchEvents: [
            { tick: 14, path: 'organisms[1].energy', baselineValue: 2, comparisonValue: 3, severity: 'high' },
            { tick: 12, path: 'organisms[0].age', baselineValue: 4, comparisonValue: 5 },
            { tick: 14, path: 'organisms[1].state', baselineValue: 'idle', comparisonValue: 'moving' }
          ]
        },
        simulationParametersSignature: 'sig-a'
      },
      replayTick: 20,
      currentReplayContext: {
        seed: 'fixture-seed',
        replayStartTick: 10,
        simulationParametersSignature: 'sig-a'
      }
    });

    expect(summary.mismatchEvents.map((eventItem) => `${eventItem.tick}:${eventItem.path}`)).toEqual([
      '12:organisms[0].age',
      '14:organisms[1].energy',
      '14:organisms[1].state'
    ]);
    expect(summary.mismatchEvents[1].severity).toBe('high');
    expect(summary.mismatchEvents.map((eventItem) => eventItem.type)).toEqual(['state', 'state', 'state']);
  });

  it('filters mismatch events deterministically by type and severity', () => {
    const mismatchEvents = [
      { id: '12:0', tick: 12, path: 'organisms[0].brain.state', type: 'state', severity: 'low' },
      { id: '14:1', tick: 14, path: 'organisms[0].brain.input[0]', type: 'input', severity: 'medium' },
      { id: '16:2', tick: 16, path: 'organisms[0].brain.output[1]', type: 'output', severity: 'high' }
    ];

    expect(filterMismatchEvents(mismatchEvents, { types: ['input'], severities: [] }).map((eventItem) => eventItem.id)).toEqual(['14:1']);
    expect(filterMismatchEvents(mismatchEvents, { types: [], severities: ['high'] }).map((eventItem) => eventItem.id)).toEqual(['16:2']);
    expect(filterMismatchEvents(mismatchEvents, { types: ['state', 'output'], severities: ['low', 'high'] }).map((eventItem) => eventItem.id)).toEqual([
      '12:0',
      '16:2'
    ]);
  });

  it('formats numeric and string mismatch values for display', () => {
    expect(formatMismatchDisplayValue(12.34567)).toBe('12.346');
    expect(formatMismatchDisplayValue('active')).toBe('active');
  });
});
