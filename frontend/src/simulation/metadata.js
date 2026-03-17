export const NO_SNAPSHOT_ID = 'No snapshot';

export function deriveRunMetadata({ resolvedSeed, tickCount, speedMultiplier, snapshotId }) {
  return {
    seed: String(resolvedSeed ?? ''),
    tickCount: Number.isInteger(tickCount) && tickCount >= 0 ? tickCount : 0,
    speedMultiplier: `${Number(speedMultiplier) || 1}x`,
    snapshotId: snapshotId ? String(snapshotId) : NO_SNAPSHOT_ID
  };
}

export function serializeRunMetadata(metadata) {
  return JSON.stringify({
    seed: metadata.seed,
    tickCount: metadata.tickCount,
    speedMultiplier: metadata.speedMultiplier,
    snapshotId: metadata.snapshotId
  });
}

export function serializeReproducibilityMetadata(metadata) {
  return JSON.stringify({
    seed: String(metadata?.seed ?? '')
  });
}
