function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generateDeterministicCopyName(baseName, snapshots) {
  const normalizedBaseName = String(baseName ?? '').trim();
  const escapedBaseName = escapeRegex(normalizedBaseName);
  const copyPattern = new RegExp(`^${escapedBaseName} \\(copy (\\d+)\\)$`, 'i');
  const usedCopyNumbers = new Set();

  for (const snapshot of snapshots ?? []) {
    const snapshotName = String(snapshot?.name ?? '').trim();
    const copyMatch = snapshotName.match(copyPattern);
    if (!copyMatch) {
      continue;
    }

    const parsedCopyNumber = Number.parseInt(copyMatch[1], 10);
    if (Number.isInteger(parsedCopyNumber) && parsedCopyNumber > 0) {
      usedCopyNumbers.add(parsedCopyNumber);
    }
  }

  let nextCopyNumber = 1;
  while (usedCopyNumbers.has(nextCopyNumber)) {
    nextCopyNumber += 1;
  }

  return `${normalizedBaseName} (copy ${nextCopyNumber})`;
}
