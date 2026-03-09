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

export const STATS_TREND_WINDOW_TICKS = 120;
export const STATS_TREND_DIRECTIONS = {
  UP: 'up',
  FLAT: 'flat',
  DOWN: 'down'
};

const POPULATION_TREND_EPSILON = 0;
const AVERAGE_ENERGY_TREND_EPSILON = 0.1;

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

export function reduceStatsTrendHistory(history, stats, maxWindowTicks = STATS_TREND_WINDOW_TICKS) {
  const safeHistory = Array.isArray(history) ? history : [];
  const safeTick = toNonNegativeInteger(stats?.tickCount);

  const nextSample = {
    tick: safeTick,
    population: toNonNegativeInteger(stats?.population),
    averageEnergy: toFiniteNumber(stats?.averageEnergy)
  };

  const tail = safeHistory[safeHistory.length - 1];
  if (tail && safeTick < tail.tick) {
    return [nextSample];
  }

  const appended = tail?.tick === nextSample.tick ? safeHistory : [...safeHistory, nextSample];
  const minTick = Math.max(0, safeTick - Math.max(0, toNonNegativeInteger(maxWindowTicks)));

  return appended.filter((sample) => sample.tick >= minTick);
}

function deriveDirectionalTrend(delta, epsilon) {
  if (Math.abs(delta) <= epsilon) {
    return STATS_TREND_DIRECTIONS.FLAT;
  }

  return delta > 0 ? STATS_TREND_DIRECTIONS.UP : STATS_TREND_DIRECTIONS.DOWN;
}

function deriveMetricTrend(history, currentTick, metric, epsilon, windowTicks = STATS_TREND_WINDOW_TICKS) {
  if (!Array.isArray(history) || history.length < 2) {
    return STATS_TREND_DIRECTIONS.FLAT;
  }

  const minTick = Math.max(0, currentTick - windowTicks);
  const startSample = history.find((sample) => sample.tick >= minTick);
  const endSample = history[history.length - 1];

  if (!startSample || !endSample || endSample.tick - startSample.tick < windowTicks) {
    return STATS_TREND_DIRECTIONS.FLAT;
  }

  return deriveDirectionalTrend(toFiniteNumber(endSample[metric]) - toFiniteNumber(startSample[metric]), epsilon);
}

export function deriveStatsTrends(history, tickCount) {
  const safeTick = toNonNegativeInteger(tickCount);

  return {
    population: deriveMetricTrend(history, safeTick, 'population', POPULATION_TREND_EPSILON),
    averageEnergy: deriveMetricTrend(history, safeTick, 'averageEnergy', AVERAGE_ENERGY_TREND_EPSILON)
  };
}

export function formatTrendIndicator(direction) {
  switch (direction) {
    case STATS_TREND_DIRECTIONS.UP:
      return '↑ Up';
    case STATS_TREND_DIRECTIONS.DOWN:
      return '↓ Down';
    default:
      return '→ Flat';
  }
}
