/**
 * Derive read-only simulation stats from the current deterministic world state.
 * This function must not mutate input state.
 */
export function deriveSimulationStats(worldState) {
  const organisms = worldState?.organisms ?? [];
  const food = worldState?.food ?? [];

  const totals = organisms.reduce(
    (acc, organism) => ({
      generation: acc.generation + organism.generation,
      energy: acc.energy + organism.energy
    }),
    { generation: 0, energy: 0 }
  );

  const divisor = organisms.length || 1;
  const tickCount = worldState?.tick ?? 0;

  return {
    tickCount,
    elapsedSeconds: tickCount / 30,
    population: organisms.length,
    foodCount: food.length,
    averageGeneration: organisms.length ? totals.generation / divisor : 0,
    averageEnergy: organisms.length ? totals.energy / divisor : 0
  };
}

export function formatSimulationStats(stats) {
  return {
    tickCount: String(stats.tickCount),
    elapsedTime: `${stats.elapsedSeconds.toFixed(1)}s`,
    population: String(stats.population),
    foodCount: String(stats.foodCount),
    averageGeneration: stats.averageGeneration.toFixed(1),
    averageEnergy: stats.averageEnergy.toFixed(1)
  };
}
