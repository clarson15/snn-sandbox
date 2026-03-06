function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

function hashStableValue(value) {
  const input = stableStringify(value);
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveReplaySnapshotBundle({
  seed,
  runMetadata,
  replayTick,
  replaySnapshotMetadata,
  replayWorldState,
  currentReplayContext
}) {
  const replayTickValue = Number.isInteger(replayTick) && replayTick >= 0 ? replayTick : null;

  return {
    seed: String(seed ?? ''),
    runMetadata: {
      tickCount: Number(runMetadata?.tickCount ?? 0),
      speedMultiplier: String(runMetadata?.speedMultiplier ?? '1x'),
      snapshotId: String(runMetadata?.snapshotId ?? 'No snapshot')
    },
    replayTick: replayTickValue,
    replaySnapshot: {
      simulationId: String(replaySnapshotMetadata?.id ?? ''),
      simulationName: String(replaySnapshotMetadata?.name ?? ''),
      sourceTick: Number(replaySnapshotMetadata?.tickCount ?? 0),
      replayStartTick: Number(replaySnapshotMetadata?.replayStartTick ?? replaySnapshotMetadata?.tickCount ?? 0)
    },
    replayContext: {
      contextLabel: String(currentReplayContext?.contextLabel ?? 'Context Match'),
      contextDifferences: Array.isArray(currentReplayContext?.contextDifferences)
        ? currentReplayContext.contextDifferences.map((value) => String(value))
        : [],
      simulationParametersSignature: String(currentReplayContext?.simulationParametersSignature ?? ''),
      replaySimulationParametersSignature: String(replaySnapshotMetadata?.simulationParametersSignature ?? '')
    },
    stateHashes: {
      replayWorldStateHash: hashStableValue(replayWorldState ?? null),
      simulationParametersSignatureHash: hashStableValue(currentReplayContext?.simulationParametersSignature ?? ''),
      replaySimulationParametersSignatureHash: hashStableValue(replaySnapshotMetadata?.simulationParametersSignature ?? '')
    }
  };
}

export function serializeReplaySnapshotBundle(bundle) {
  return stableStringify(bundle);
}

export function downloadReplaySnapshotBundle(bundle, timestamp = new Date()) {
  const payload = serializeReplaySnapshotBundle(bundle);
  const stamp = timestamp.toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `replay-snapshot-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return payload;
}
