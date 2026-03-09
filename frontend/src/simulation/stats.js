/**
 * Derive read-only simulation stats from the current deterministic world state.
 * This function must not mutate input state.
 */
function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function toNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export function deriveSimulationStats(worldState) {
  const organisms = Array.isArray(worldState?.organisms) ? worldState.organisms : [];
  const food = Array.isArray(worldState?.food) ? worldState.food : [];

  const totals = organisms.reduce(
    (acc, organism) => ({
      generation: acc.generation + toFiniteNumber(organism?.generation),
      energy: acc.energy + toFiniteNumber(organism?.energy)
    }),
    { generation: 0, energy: 0 }
  );

  const tickCount = toNonNegativeInteger(worldState?.tick);
  const population = organisms.length;

  return {
    tickCount,
    elapsedSeconds: tickCount / 30,
    population,
    foodCount: food.length,
    averageGeneration: population ? totals.generation / population : 0,
    averageEnergy: population ? totals.energy / population : 0
  };
}

export function formatSimulationStats(stats) {
  const tickCount = toNonNegativeInteger(stats?.tickCount);
  const elapsedSeconds = Math.max(0, toFiniteNumber(stats?.elapsedSeconds));
  const population = toNonNegativeInteger(stats?.population);
  const foodCount = toNonNegativeInteger(stats?.foodCount);
  const averageGeneration = toFiniteNumber(stats?.averageGeneration);
  const averageEnergy = toFiniteNumber(stats?.averageEnergy);

  return {
    tickCount: String(tickCount),
    elapsedTime: `${elapsedSeconds.toFixed(1)}s`,
    population: String(population),
    foodCount: String(foodCount),
    averageGeneration: averageGeneration.toFixed(1),
    averageEnergy: averageEnergy.toFixed(1)
  };
}
