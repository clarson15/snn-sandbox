import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildReplayFixtureFailureRecord,
  formatReplayParityFailureSummary,
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
      seed: 'seed-a',
      expectedWorldState,
      actualWorldState
    });

    expect(record).toEqual({
      fixtureName: 'fixture-a',
      seed: 'seed-a',
      firstMismatchPath: 'snapshot.organisms[0].energy',
      expectedDigest: '01e7d1b3',
      actualDigest: '4a63e6fa'
    });
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
      ['| fixture | seed | first mismatch path | expected digest | actual digest |',
      '|---|---|---|---|---|',
      '| alpha | seed-a | snapshot.organisms[0].x | 33333333 | 44444444 |',
      '| zeta | seed-z | snapshot.tick | 11111111 | 22222222 |'].join('\n')
    );
  });

  it('writes summary output to disk', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-parity-summary-'));
    const outputPath = path.join(tempDir, 'reports', 'summary.md');
    const summary = '| fixture | seed | first mismatch path | expected digest | actual digest |';

    const resolvedPath = writeReplayParityFailureSummary(summary, outputPath);

    expect(resolvedPath).toBe(outputPath);
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(`${summary}\n`);
  });
});
