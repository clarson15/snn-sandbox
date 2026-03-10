function toSortedIds(values) {
  return [...new Set((values ?? []).map((value) => String(value)))].sort((left, right) => left.localeCompare(right));
}

function toEnergyLeaders(worldState, limit = 8) {
  return [...(worldState?.organisms ?? [])]
    .sort((left, right) => {
      const energyDelta = Number(right?.energy ?? 0) - Number(left?.energy ?? 0);
      if (energyDelta !== 0) {
        return energyDelta;
      }

      return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
    })
    .slice(0, limit)
    .map((organism) => String(organism.id));
}

export function buildReplayEventOrderTraceEntry(previousWorldState, nextWorldState) {
  const previousIds = new Set((previousWorldState?.organisms ?? []).map((organism) => String(organism.id)));
  const nextIds = new Set((nextWorldState?.organisms ?? []).map((organism) => String(organism.id)));

  const birthIds = toSortedIds((nextWorldState?.organisms ?? [])
    .filter((organism) => !previousIds.has(String(organism.id)))
    .map((organism) => organism.id));
  const deathIds = toSortedIds((previousWorldState?.organisms ?? [])
    .filter((organism) => !nextIds.has(String(organism.id)))
    .map((organism) => organism.id));
  const energyLeaderIds = toSortedIds(toEnergyLeaders(nextWorldState));

  return {
    tick: Number(nextWorldState?.tick ?? 0),
    orderedInteractionKeys: [...birthIds.map((id) => `birth:${id}`), ...deathIds.map((id) => `death:${id}`), ...energyLeaderIds.map((id) => `energyLeader:${id}`)]
      .sort((left, right) => left.localeCompare(right))
  };
}

export function collectReplayEventOrderTrace({ baseWorldState, seed, tickBudget, stepWorld, createSeededPrng }) {
  const rng = createSeededPrng(seed);
  let previousWorldState = JSON.parse(JSON.stringify(baseWorldState));
  const trace = [];

  for (let tick = 0; tick < tickBudget; tick += 1) {
    const nextWorldState = stepWorld(previousWorldState, rng);
    trace.push(buildReplayEventOrderTraceEntry(previousWorldState, nextWorldState));
    previousWorldState = nextWorldState;
  }

  return trace;
}

export function formatReplayEventOrderDiffSnippet(expectedTrace, actualTrace, maxLines = 6) {
  const maxLength = Math.max(expectedTrace.length, actualTrace.length);
  const lines = [];

  for (let index = 0; index < maxLength; index += 1) {
    const expected = expectedTrace[index] ?? null;
    const actual = actualTrace[index] ?? null;

    if (JSON.stringify(expected) === JSON.stringify(actual)) {
      continue;
    }

    lines.push(
      `tick=${expected?.tick ?? actual?.tick ?? 'unknown'} expected=${JSON.stringify(expected?.orderedInteractionKeys ?? [])} actual=${JSON.stringify(actual?.orderedInteractionKeys ?? [])}`
    );

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (lines.length === 0) {
    return 'Per-tick event ordering diff snippet: traces match.';
  }

  return `Per-tick event ordering diff snippet:\n- ${lines.join('\n- ')}`;
}
