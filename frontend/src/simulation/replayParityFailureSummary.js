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

function collectMismatchFields(expectedValue, actualValue, currentPath = 'snapshot', acc = [], maxFields = 8) {
  if (acc.length >= maxFields || Object.is(expectedValue, actualValue)) {
    return acc;
  }

  const expectedIsArray = Array.isArray(expectedValue);
  const actualIsArray = Array.isArray(actualValue);
  if (expectedIsArray || actualIsArray) {
    if (!expectedIsArray || !actualIsArray) {
      acc.push({ path: currentPath, expected: expectedValue ?? null, actual: actualValue ?? null });
      return acc;
    }

    const maxLength = Math.max(expectedValue.length, actualValue.length);
    for (let index = 0; index < maxLength; index += 1) {
      collectMismatchFields(expectedValue[index], actualValue[index], `${currentPath}[${index}]`, acc, maxFields);
      if (acc.length >= maxFields) {
        break;
      }
    }

    return acc;
  }

  const expectedIsObject = expectedValue !== null && typeof expectedValue === 'object';
  const actualIsObject = actualValue !== null && typeof actualValue === 'object';
  if (expectedIsObject || actualIsObject) {
    if (!expectedIsObject || !actualIsObject) {
      acc.push({ path: currentPath, expected: expectedValue ?? null, actual: actualValue ?? null });
      return acc;
    }

    const keys = Array.from(new Set([...Object.keys(expectedValue), ...Object.keys(actualValue)])).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      collectMismatchFields(expectedValue[key], actualValue[key], `${currentPath}.${key}`, acc, maxFields);
      if (acc.length >= maxFields) {
        break;
      }
    }

    return acc;
  }

  acc.push({ path: currentPath, expected: expectedValue ?? null, actual: actualValue ?? null });
  return acc;
}

function parsePathSegments(pathValue) {
  return String(pathValue ?? '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

function getValueAtPath(value, pathValue) {
  const segments = parsePathSegments(pathValue);
  const normalizedSegments = segments[0] === 'snapshot' ? segments.slice(1) : segments;
  let current = value;
  for (const segment of normalizedSegments) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return current ?? null;
}

function deriveEntityIdFromMismatchPath(firstMismatchPath, expectedSnapshot, actualSnapshot) {
  const match = String(firstMismatchPath ?? '').match(/^snapshot\.(organisms|food)\[(\d+)\]/);
  if (!match) {
    return null;
  }

  const index = Number.parseInt(match[2], 10);
  const expectedEntity = expectedSnapshot?.[match[1]]?.[index];
  const actualEntity = actualSnapshot?.[match[1]]?.[index];
  const entityId = expectedEntity?.id ?? actualEntity?.id ?? null;
  return typeof entityId === 'string' && entityId.trim().length > 0 ? entityId : null;
}

export function buildReplayFixtureFailureRecord({
  fixtureName,
  fixtureProfile,
  seed,
  expectedWorldState,
  actualWorldState,
  fixtureId,
  milestoneTick,
  expectedFingerprint,
  actualFingerprint,
  eventOrderingDiffSummary,
  firstDivergenceTick,
  rngTraceSnippet
}) {
  const expectedSnapshot = buildReplayDeterminismSnapshot(expectedWorldState);
  const actualSnapshot = buildReplayDeterminismSnapshot(actualWorldState);
  const firstMismatchPath = compareValues(expectedSnapshot, actualSnapshot) ?? 'snapshot';
  const mismatchFields = collectMismatchFields(expectedSnapshot, actualSnapshot);

  return {
    fixtureName,
    fixtureId: fixtureId ?? fixtureName,
    fixtureProfile: fixtureProfile ?? '',
    seed,
    milestoneTick: Number.isInteger(milestoneTick) ? milestoneTick : null,
    firstDivergenceTick: Number.isInteger(firstDivergenceTick) ? firstDivergenceTick : null,
    entityId: deriveEntityIdFromMismatchPath(firstMismatchPath, expectedSnapshot, actualSnapshot),
    firstMismatchPath,
    mismatchFields,
    firstDivergenceSnapshot: {
      path: firstMismatchPath,
      expectedValue: getValueAtPath(expectedSnapshot, firstMismatchPath),
      actualValue: getValueAtPath(actualSnapshot, firstMismatchPath)
    },
    expectedDigest: hashStableCanonicalValue(expectedSnapshot),
    actualDigest: hashStableCanonicalValue(actualSnapshot),
    expectedFingerprint: expectedFingerprint ?? hashStableCanonicalValue(expectedSnapshot),
    actualFingerprint: actualFingerprint ?? hashStableCanonicalValue(actualSnapshot),
    eventOrderingDiffSummary: typeof eventOrderingDiffSummary === 'string' ? eventOrderingDiffSummary : '',
    rngTraceSnippet: typeof rngTraceSnippet === 'string' ? rngTraceSnippet : ''
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
      actualFingerprint: String(record.actualFingerprint ?? record.actualDigest),
      eventOrderingDiffSummary: String(record.eventOrderingDiffSummary ?? '').replace(/\n/g, '<br>')
    }))
    .sort((left, right) => left.fixtureName.localeCompare(right.fixtureName));

  const header = '| fixture | fixture id | seed | milestone tick | first mismatch path | expected digest | actual digest | expected fingerprint | actual fingerprint | event ordering diff summary |';
  const divider = '|---|---|---|---|---|---|---|---|---|---|';
  const lines = normalizedRecords.map(
    (record) =>
      `| ${record.fixtureName} | ${record.fixtureId} | ${record.seed} | ${record.milestoneTick} | ${record.firstMismatchPath} | ${record.expectedDigest} | ${record.actualDigest} | ${record.expectedFingerprint} | ${record.actualFingerprint} | ${record.eventOrderingDiffSummary || '-'} |`
  );

  return [header, divider, ...lines].join('\n');
}

export function buildReplayParityFailureArtifact(records) {
  return {
    schemaVersion: '1.0.0',
    failures: [...records]
      .map((record) => ({
        fixture: String(record.fixtureName),
        profile: String(record.fixtureProfile ?? ''),
        seed: String(record.seed),
        tick: Number.isInteger(record.milestoneTick) ? record.milestoneTick : null,
        firstDivergenceTick: Number.isInteger(record.firstDivergenceTick) ? record.firstDivergenceTick : null,
        entityId: record.entityId ?? null,
        mismatchFields: Array.isArray(record.mismatchFields) ? record.mismatchFields : [],
        firstDivergenceSnapshot: record.firstDivergenceSnapshot ?? null,
        firstMismatchPath: String(record.firstMismatchPath),
        expectedDigest: String(record.expectedDigest),
        actualDigest: String(record.actualDigest),
        expectedFingerprint: String(record.expectedFingerprint ?? record.expectedDigest),
        actualFingerprint: String(record.actualFingerprint ?? record.actualDigest),
        eventOrderingDiffSummary: String(record.eventOrderingDiffSummary ?? ''),
        rngTraceSnippet: String(record.rngTraceSnippet ?? '')
      }))
      .sort((left, right) => left.fixture.localeCompare(right.fixture))
  };
}

export function writeReplayParityFailureSummary(summary, outputPath) {
  const resolvedPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${summary}\n`, 'utf8');
  return resolvedPath;
}

export function writeReplayParityFailureArtifact(records, outputPath) {
  const resolvedPath = path.resolve(outputPath);
  const payload = buildReplayParityFailureArtifact(records);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return resolvedPath;
}
