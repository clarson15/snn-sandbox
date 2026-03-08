export function deriveDeterministicOrganismIds(organisms) {
  if (!Array.isArray(organisms) || organisms.length === 0) {
    return [];
  }

  return organisms
    .map((organism) => organism.id)
    .sort((left, right) => left.localeCompare(right));
}

export function resolveDeadSelectionFallback(sortedOrganismIds, selectedOrganismId) {
  if (!selectedOrganismId || !Array.isArray(sortedOrganismIds) || sortedOrganismIds.length === 0) {
    return null;
  }

  const insertionIndex = sortedOrganismIds.findIndex((id) => id.localeCompare(selectedOrganismId) > 0);
  if (insertionIndex >= 0) {
    return sortedOrganismIds[insertionIndex];
  }

  return sortedOrganismIds[sortedOrganismIds.length - 1] ?? null;
}

export function resolveAdjacentSelectionId(sortedOrganismIds, selectedOrganismId, offset) {
  if (!Array.isArray(sortedOrganismIds) || sortedOrganismIds.length === 0 || !Number.isInteger(offset) || offset === 0) {
    return null;
  }

  const normalizedOffset = offset > 0 ? 1 : -1;
  const currentIndex = selectedOrganismId
    ? sortedOrganismIds.indexOf(selectedOrganismId)
    : -1;

  if (currentIndex >= 0) {
    const nextIndex = (currentIndex + normalizedOffset + sortedOrganismIds.length) % sortedOrganismIds.length;
    return sortedOrganismIds[nextIndex];
  }

  const fallbackId = resolveDeadSelectionFallback(sortedOrganismIds, selectedOrganismId);
  if (fallbackId) {
    const fallbackIndex = sortedOrganismIds.indexOf(fallbackId);
    const nextIndex = (fallbackIndex + normalizedOffset + sortedOrganismIds.length) % sortedOrganismIds.length;
    return sortedOrganismIds[nextIndex];
  }

  return normalizedOffset > 0
    ? sortedOrganismIds[0]
    : sortedOrganismIds[sortedOrganismIds.length - 1];
}
