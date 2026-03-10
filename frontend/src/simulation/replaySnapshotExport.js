import { hashStableCanonicalValue, stableCanonicalStringify } from './replayCanonicalization';

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
      replayWorldStateHash: hashStableCanonicalValue(replayWorldState ?? null),
      simulationParametersSignatureHash: hashStableCanonicalValue(currentReplayContext?.simulationParametersSignature ?? ''),
      replaySimulationParametersSignatureHash: hashStableCanonicalValue(replaySnapshotMetadata?.simulationParametersSignature ?? '')
    }
  };
}

export function serializeReplaySnapshotBundle(bundle) {
  return stableCanonicalStringify(bundle);
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
