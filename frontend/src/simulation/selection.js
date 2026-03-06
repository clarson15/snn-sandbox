/**
 * Deterministic organism selection helper.
 * Stable tie-break rule for overlapping hit targets:
 * 1) nearest squared distance first
 * 2) lexical organism id if distance is equal
 */
export function pickOrganismAtPoint(organisms, x, y, hitRadius = 8) {
  const hitRadiusSquared = hitRadius * hitRadius;

  let winner = null;
  let winnerDistance = Number.POSITIVE_INFINITY;

  for (const organism of organisms) {
    const dx = organism.x - x;
    const dy = organism.y - y;
    const distance = dx * dx + dy * dy;

    if (distance > hitRadiusSquared) {
      continue;
    }

    if (
      distance < winnerDistance
      || (distance === winnerDistance && winner !== null && organism.id.localeCompare(winner.id) < 0)
      || winner === null
    ) {
      winner = organism;
      winnerDistance = distance;
    }
  }

  return winner;
}
