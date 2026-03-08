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
