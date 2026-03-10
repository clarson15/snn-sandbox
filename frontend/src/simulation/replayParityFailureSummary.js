import fs from 'node:fs';
import path from 'node:path';

import { hashStableCanonicalValue } from './replayCanonicalization';
import { buildReplayDeterminismSnapshot } from './replayDeterminismDiagnostics';

function compareValues(expectedValue, actualValue, currentPath = 'snapshot') {
  if (Object.is(expectedValue, actualValue)) {
    return null;
  }

  const expectedIsArray = Array.isArray(expectedValue);
  const actualIsArray = Array.isArray(actualValue);
  if (expectedIsArray || actualIsArray) {
    if (!expectedIsArray || !actualIsArray) {
      return currentPath;
    }

    const maxLength = Math.max(expectedValue.length, actualValue.length);
    for (let index = 0; index < maxLength; index += 1) {
      const mismatchPath = compareValues(expectedValue[index], actualValue[index], `${currentPath}[${index}]`);
      if (mismatchPath) {
        return mismatchPath;
      }
    }

    return null;
  }

  const expectedIsObject = expectedValue !== null && typeof expectedValue === 'object';
  const actualIsObject = actualValue !== null && typeof actualValue === 'object';
  if (expectedIsObject || actualIsObject) {
    if (!expectedIsObject || !actualIsObject) {
      return currentPath;
    }

    const keys = Array.from(new Set([...Object.keys(expectedValue), ...Object.keys(actualValue)])).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const mismatchPath = compareValues(expectedValue[key], actualValue[key], `${currentPath}.${key}`);
      if (mismatchPath) {
        return mismatchPath;
      }
    }

    return null;
  }

  return currentPath;
}

export function buildReplayFixtureFailureRecord({
  fixtureName,
  seed,
  expectedWorldState,
  actualWorldState,
  fixtureId,
  milestoneTick,
  expectedFingerprint,
  actualFingerprint
}) {
  const expectedSnapshot = buildReplayDeterminismSnapshot(expectedWorldState);
  const actualSnapshot = buildReplayDeterminismSnapshot(actualWorldState);
  const firstMismatchPath = compareValues(expectedSnapshot, actualSnapshot) ?? 'snapshot';

  return {
    fixtureName,
    fixtureId: fixtureId ?? fixtureName,
    seed,
    milestoneTick: Number.isInteger(milestoneTick) ? milestoneTick : null,
    firstMismatchPath,
    expectedDigest: hashStableCanonicalValue(expectedSnapshot),
    actualDigest: hashStableCanonicalValue(actualSnapshot),
    expectedFingerprint: expectedFingerprint ?? hashStableCanonicalValue(expectedSnapshot),
    actualFingerprint: actualFingerprint ?? hashStableCanonicalValue(actualSnapshot)
  };
}

export function formatReplayParityFailureSummary(records) {
  const normalizedRecords = [...records]
    .map((record) => ({
      fixtureName: String(record.fixtureName),
      fixtureId: String(record.fixtureId ?? record.fixtureName),
      seed: String(record.seed),
      milestoneTick: Number.isInteger(record.milestoneTick) ? String(record.milestoneTick) : '-',
      firstMismatchPath: String(record.firstMismatchPath),
      expectedDigest: String(record.expectedDigest),
      actualDigest: String(record.actualDigest),
      expectedFingerprint: String(record.expectedFingerprint ?? record.expectedDigest),
      actualFingerprint: String(record.actualFingerprint ?? record.actualDigest)
    }))
    .sort((left, right) => left.fixtureName.localeCompare(right.fixtureName));

  const header = '| fixture | fixture id | seed | milestone tick | first mismatch path | expected digest | actual digest | expected fingerprint | actual fingerprint |';
  const divider = '|---|---|---|---|---|---|---|---|---|';
  const lines = normalizedRecords.map(
    (record) =>
      `| ${record.fixtureName} | ${record.fixtureId} | ${record.seed} | ${record.milestoneTick} | ${record.firstMismatchPath} | ${record.expectedDigest} | ${record.actualDigest} | ${record.expectedFingerprint} | ${record.actualFingerprint} |`
  );

  return [header, divider, ...lines].join('\n');
}

export function writeReplayParityFailureSummary(summary, outputPath) {
  const resolvedPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${summary}\n`, 'utf8');
  return resolvedPath;
}
