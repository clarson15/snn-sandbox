function stableSerializeValue(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeValue(item)).join(', ')}]`;
  }

  if (typeof value === 'object') {
    const ordered = Object.keys(value)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((key) => `${JSON.stringify(key)}:${stableSerializeValue(value[key])}`)
      .join(',');
    return `{${ordered}}`;
  }

  return JSON.stringify(value);
}

function toText(value, fallback = 'N/A') {
  if (value === null || value === undefined) {
    return fallback;
  }

  return stableSerializeValue(value);
}

export function formatReplayMismatchReport({ runMetadata, replaySummary, selectedMismatchDetails }) {
  const reportFields = [
    ['seed', runMetadata?.seed],
    ['runTick', runMetadata?.tickCount],
    ['speedMultiplier', runMetadata?.speedMultiplier],
    ['snapshotId', runMetadata?.snapshotId],
    ['simulationId', replaySummary?.simulationId],
    ['simulationName', replaySummary?.simulationName],
    ['replayContext', replaySummary?.contextLabel],
    ['firstMismatchTick', replaySummary?.firstMismatchTick],
    ['selectedMismatch.tick', selectedMismatchDetails?.tick],
    ['selectedMismatch.path', selectedMismatchDetails?.path],
    ['selectedMismatch.entityId', selectedMismatchDetails?.entityId],
    ['selectedMismatch.baselineValue', selectedMismatchDetails?.baselineValue],
    ['selectedMismatch.comparisonValue', selectedMismatchDetails?.comparisonValue],
    ['selectedMismatch.absoluteDelta', selectedMismatchDetails?.absoluteDelta],
    ['selectedMismatch.severity', selectedMismatchDetails?.severity]
  ];

  return ['Replay mismatch report', ...reportFields.map(([field, value]) => `${field}: ${toText(value)}`)].join('\n');
}
