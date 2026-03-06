import { describe, expect, it } from 'vitest';

import { formatReplayMismatchReport } from './replayMismatchReport';

describe('formatReplayMismatchReport', () => {
  it('formats deterministic plain-text report with stable field ordering', () => {
    const report = formatReplayMismatchReport({
      runMetadata: {
        seed: 'fixture-seed',
        tickCount: 44,
        speedMultiplier: '2x',
        snapshotId: 'sim-1'
      },
      replaySummary: {
        simulationId: 'sim-1',
        simulationName: 'Fixture simulation',
        contextLabel: 'Context Match',
        firstMismatchTick: 12
      },
      selectedMismatchDetails: {
        tick: 12,
        path: 'organisms[0].brain.state',
        entityId: 'org-1',
        baselineValue: { b: 2, a: 1 },
        comparisonValue: { a: 1, b: 3 },
        absoluteDelta: 1,
        severity: 'high'
      }
    });

    expect(report).toBe(
      [
        'Replay mismatch report',
        'seed: fixture-seed',
        'runTick: 44',
        'speedMultiplier: 2x',
        'snapshotId: sim-1',
        'simulationId: sim-1',
        'simulationName: Fixture simulation',
        'replayContext: Context Match',
        'firstMismatchTick: 12',
        'selectedMismatch.tick: 12',
        'selectedMismatch.path: organisms[0].brain.state',
        'selectedMismatch.entityId: org-1',
        'selectedMismatch.baselineValue: {"a":1,"b":2}',
        'selectedMismatch.comparisonValue: {"a":1,"b":3}',
        'selectedMismatch.absoluteDelta: 1',
        'selectedMismatch.severity: high'
      ].join('\n')
    );
  });

  it('returns deterministic fallbacks for missing values', () => {
    const report = formatReplayMismatchReport({
      runMetadata: null,
      replaySummary: null,
      selectedMismatchDetails: null
    });

    expect(report).toContain('firstMismatchTick: N/A');
    expect(report).toContain('selectedMismatch.path: N/A');
  });
});
