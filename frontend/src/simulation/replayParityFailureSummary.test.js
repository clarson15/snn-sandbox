import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildReplayFixtureFailureRecord,
  buildReplayParityFailureArtifact,
  buildReplayParityLocalReproCommand,
  formatReplayParityFailureSummary,
  writeReplayParityFailureArtifact,
  writeReplayParityFailureSummary
} from './replayParityFailureSummary';

describe('replayParityFailureSummary', () => {
  it('builds deterministic per-fixture mismatch records', () => {
    const expectedWorldState = {
      tick: 12,
      food: [],
      organisms: [{ id: 'org-a', x: 1, y: 2, energy: 4 }]
    };
    const actualWorldState = {
      tick: 12,
      food: [],
      organisms: [{ id: 'org-a', x: 1, y: 2, energy: 7 }]
    };

    const record = buildReplayFixtureFailureRecord({
      fixtureName: 'fixture-a',
      fixtureProfile: 'dense-food',
      seed: 'seed-a',
      expectedWorldState,
      actualWorldState
    });

    expect(record).toEqual({
      fixtureName: 'fixture-a',
      fixtureId: 'fixture-a',
      fixtureProfile: 'dense-food',
      seed: 'seed-a',
      milestoneTick: null,
      firstDivergenceTick: null,
      entityId: 'org-a',
      firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-a' },
      firstMismatchPath: 'snapshot.organisms[0].energy',
      mismatchFields: [{ path: 'snapshot.organisms[0].energy', expected: 4, actual: 7 }],
      firstDivergenceSnapshot: {
        path: 'snapshot.organisms[0].energy',
        expectedValue: 4,
        actualValue: 7
      },
      firstDivergenceFingerprint: {
        baseline: {
          organismCount: 1,
          foodCount: 0,
          aggregateHash: '01e7d1b3',
          firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-a' }
        },
        candidate: {
          organismCount: 1,
          foodCount: 0,
          aggregateHash: '4a63e6fa',
          firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-a' }
        }
      },
      expectedDigest: '01e7d1b3',
      actualDigest: '4a63e6fa',
      expectedFingerprint: '01e7d1b3',
      actualFingerprint: '4a63e6fa',
      eventOrderingDiffSummary: '',
      rngTraceSnippet: ''
    });
  });

  it('captures divergent organism index when id is missing', () => {
    const record = buildReplayFixtureFailureRecord({
      fixtureName: 'fixture-idless-organism',
      seed: 'seed-idless-organism',
      expectedWorldState: {
        tick: 3,
        organisms: [{ id: '', x: 1, y: 1, energy: 2 }],
        food: []
      },
      actualWorldState: {
        tick: 3,
        organisms: [{ id: '', x: 2, y: 1, energy: 2 }],
        food: []
      }
    });

    expect(record.entityId).toBeNull();
    expect(record.firstDivergentEntity).toEqual({ kind: 'organism', index: 0, id: null });
    expect(record.firstDivergenceFingerprint?.baseline?.firstDivergentEntity).toEqual({ kind: 'organism', index: 0, id: null });
  });

  it('formats stable markdown table ordering by fixture name', () => {
    const summary = formatReplayParityFailureSummary([
      {
        fixtureName: 'zeta',
        seed: 'seed-z',
        firstMismatchPath: 'snapshot.tick',
        expectedDigest: '11111111',
        actualDigest: '22222222'
      },
      {
        fixtureName: 'alpha',
        seed: 'seed-a',
        firstMismatchPath: 'snapshot.organisms[0].x',
        expectedDigest: '33333333',
        actualDigest: '44444444'
      }
    ]);

    expect(summary).toBe(
      ['| fixture | fixture id | profile | seed | milestone tick | first mismatch path | expected digest | actual digest | expected fingerprint | actual fingerprint | local repro command | event ordering diff summary |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|',
      '| alpha | alpha | - | seed-a | - | snapshot.organisms[0].x | 33333333 | 44444444 | 33333333 | 44444444 | REPLAY_PARITY_FIXTURE_NAMES="alpha" REPLAY_PARITY_FIXTURE_PROFILES="" REPLAY_PARITY_SEED="seed-a" npm --prefix frontend test -- src/simulation/replay.test.js -t "validates deterministic replay parity across a curated multi-fixture matrix" | - |',
      '| zeta | zeta | - | seed-z | - | snapshot.tick | 11111111 | 22222222 | 11111111 | 22222222 | REPLAY_PARITY_FIXTURE_NAMES="zeta" REPLAY_PARITY_FIXTURE_PROFILES="" REPLAY_PARITY_SEED="seed-z" npm --prefix frontend test -- src/simulation/replay.test.js -t "validates deterministic replay parity across a curated multi-fixture matrix" | - |'].join('\n')
    );
  });

  it('builds a one-command local repro hint for the failing fixture case', () => {
    const command = buildReplayParityLocalReproCommand({
      fixtureName: 'chunked-tick-execution-equivalence [phase=cadence-checkpoint]',
      fixtureId: 'chunked-tick-execution-equivalence|cadence:segmented-resume',
      fixtureProfile: 'sparse-food',
      seed: 'fixture-chunked-tick-execution-equivalence'
    });

    expect(command).toBe(
      'REPLAY_PARITY_FIXTURE_NAMES="chunked-tick-execution-equivalence" REPLAY_PARITY_FIXTURE_PROFILES="sparse-food" REPLAY_PARITY_SEED="fixture-chunked-tick-execution-equivalence" npm --prefix frontend test -- src/simulation/replay.test.js -t "validates deterministic replay parity across a curated multi-fixture matrix"'
    );
  });

  it('builds a deterministic JSON artifact payload without timestamps', () => {
    const artifact = buildReplayParityFailureArtifact([
      {
        fixtureName: 'fixture-a',
        fixtureProfile: 'dense-food',
        seed: 'seed-a',
        milestoneTick: 42,
        firstDivergenceTick: 19,
        entityId: 'org-1',
        firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-1' },
        firstDivergenceFingerprint: {
          baseline: {
            organismCount: 2,
            foodCount: 3,
            aggregateHash: 'aaaa1111',
            firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-1' }
          },
          candidate: {
            organismCount: 2,
            foodCount: 3,
            aggregateHash: 'bbbb2222',
            firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-1' }
          }
        },
        mismatchFields: [{ path: 'snapshot.organisms[0].energy', expected: 4, actual: 7 }],
        firstDivergenceSnapshot: { path: 'snapshot.organisms[0].energy', expectedValue: 4, actualValue: 7 },
        firstMismatchPath: 'snapshot.organisms[0].energy',
        expectedDigest: 'aaaa1111',
        actualDigest: 'bbbb2222',
        expectedFingerprint: 'aaaa1111',
        actualFingerprint: 'bbbb2222',
        eventOrderingDiffSummary: '',
        rngTraceSnippet: 'tick=19 call=411 consumer=mutateTraits.nextFloat'
      }
    ]);

    expect(artifact).toEqual({
      schemaVersion: '1.0.0',
      failures: [
        {
          fixture: 'fixture-a',
          profile: 'dense-food',
          seed: 'seed-a',
          tick: 42,
          firstDivergenceTick: 19,
          entityId: 'org-1',
          firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-1' },
          firstDivergenceFingerprint: {
            baseline: {
              organismCount: 2,
              foodCount: 3,
              aggregateHash: 'aaaa1111',
              firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-1' }
            },
            candidate: {
              organismCount: 2,
              foodCount: 3,
              aggregateHash: 'bbbb2222',
              firstDivergentEntity: { kind: 'organism', index: 0, id: 'org-1' }
            }
          },
          mismatchFields: [{ path: 'snapshot.organisms[0].energy', expected: 4, actual: 7 }],
          firstDivergenceSnapshot: { path: 'snapshot.organisms[0].energy', expectedValue: 4, actualValue: 7 },
          firstMismatchPath: 'snapshot.organisms[0].energy',
          expectedDigest: 'aaaa1111',
          actualDigest: 'bbbb2222',
          expectedFingerprint: 'aaaa1111',
          actualFingerprint: 'bbbb2222',
          eventOrderingDiffSummary: '',
          rngTraceSnippet: 'tick=19 call=411 consumer=mutateTraits.nextFloat'
        }
      ]
    });
    expect(JSON.stringify(artifact)).not.toContain('timestamp');
  });

  it('writes summary output to disk', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-parity-summary-'));
    const outputPath = path.join(tempDir, 'reports', 'summary.md');
    const summary = '| fixture | seed | first mismatch path | expected digest | actual digest |';

    const resolvedPath = writeReplayParityFailureSummary(summary, outputPath);

    expect(resolvedPath).toBe(outputPath);
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(`${summary}\n`);
  });

  it('writes JSON artifact output to disk', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-parity-artifact-'));
    const outputPath = path.join(tempDir, 'reports', 'artifact.json');
    const records = [
      {
        fixtureName: 'fixture-b',
        fixtureProfile: 'sparse-food',
        seed: 'seed-b',
        milestoneTick: 9,
        firstMismatchPath: 'snapshot.tick',
        mismatchFields: [{ path: 'snapshot.tick', expected: 9, actual: 10 }],
        firstDivergenceSnapshot: { path: 'snapshot.tick', expectedValue: 9, actualValue: 10 },
        expectedDigest: '11111111',
        actualDigest: '22222222'
      }
    ];

    const resolvedPath = writeReplayParityFailureArtifact(records, outputPath);

    expect(resolvedPath).toBe(outputPath);
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.failures[0].profile).toBe('sparse-food');
  });
});
