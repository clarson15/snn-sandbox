import { describe, expect, it } from 'vitest';

import { deriveReplaySummaryStrip } from './replaySummary';

describe('deriveReplaySummaryStrip', () => {
  it('maps replay metadata into deterministic summary values', () => {
    expect(
      deriveReplaySummaryStrip({
        replaySnapshotMetadata: {
          id: 'sim-123',
          name: 'Fixture snapshot',
          seed: 'fixture-seed',
          tickCount: 10
        },
        replayTick: 42
      })
    ).toEqual({
      seed: 'fixture-seed',
      simulationName: 'Fixture snapshot',
      simulationId: 'sim-123',
      startTick: 10,
      endTick: 42,
      durationTicks: 32
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
        replayTick: null
      })
    ).toEqual({
      seed: 'Unknown seed',
      simulationName: 'Unknown simulation',
      simulationId: 'Unknown simulation ID',
      startTick: 'Unknown tick',
      endTick: 'Unknown tick',
      durationTicks: 'Unknown duration'
    });
  });
});
