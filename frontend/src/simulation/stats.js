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

/**
 * Calculate genetic distance between two organisms based on trait differences.
 * Uses normalized Euclidean distance across all physical traits.
 * @param {object} o1 - First organism with traits {size, speed, adolescenceAge, eggHatchTime, visionRange, turnRate, metabolism}
 * @param {object} o2 - Second organism with traits
 * @returns {number} Distance between 0 and 1 (1 = max different)
 */
function calculateGeneticDistance(o1, o2) {
  const traits = ['size', 'speed', 'adolescenceAge', 'eggHatchTime', 'visionRange', 'turnRate', 'metabolism'];

  // Get trait ranges from typical values to normalize
  const maxValues = { size: 5, speed: 5, adolescenceAge: 500, eggHatchTime: 10, visionRange: 20, turnRate: 1, metabolism: 1 };

  let squaredSum = 0;
  for (const trait of traits) {
    const v1 = o1?.traits?.[trait] ?? 0;
    const v2 = o2?.traits?.[trait] ?? 0;
    const maxVal = maxValues[trait] || 1;
    const diff = (v1 - v2) / maxVal;
    squaredSum += diff * diff;
  }

  return Math.sqrt(squaredSum);
}

/**
 * Cluster organisms into species using single-linkage clustering.
 * Two organisms are in the same species if their distance is below threshold.
 * @param {WorldOrganism[]} organisms - Array of organisms
 * @param {number} threshold - Distance threshold (default 0.3)
 * @returns {number} Number of distinct species
 */
function countSpecies(organisms, threshold = 0.3) {
  if (!organisms || organisms.length === 0) return 0;
  if (organisms.length === 1) return 1;

  // Build adjacency: pairs of organisms below threshold distance
  const n = organisms.length;
  const adjacency = new Map();

  // Initialize all nodes first
  for (let i = 0; i < n; i++) {
    adjacency.set(i, new Set());
  }

  // Add edges between organisms below threshold distance
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (calculateGeneticDistance(organisms[i], organisms[j]) <= threshold) {
        adjacency.get(i).add(j);
        adjacency.get(j).add(i);
      }
    }
  }

  // Find connected components (species)
  const visited = new Set();
  let speciesCount = 0;

  function dfs(node) {
    visited.add(node);
    for (const neighbor of adjacency.get(node) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) {
      speciesCount++;
      dfs(i);
    }
  }

  return speciesCount;
}

export const STATS_TREND_WINDOW_TICKS = 120;
export const STATS_TREND_DIRECTIONS = {
  UP: 'up',
  FLAT: 'flat',
  DOWN: 'down'
};

const POPULATION_TREND_EPSILON = 0;
const FOOD_COUNT_TREND_EPSILON = 0;
const AVERAGE_GENERATION_TREND_EPSILON = 0.1;
const AVERAGE_ENERGY_TREND_EPSILON = 0.1;

// Warning threshold for average organism energy
// Below this level, organisms are at risk of dying from energy exhaustion
const ENERGY_DEATH_WARNING_THRESHOLD = 5;

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
  const speciesCount = countSpecies(organisms);
  const averageEnergy = population ? totals.energy / population : 0;

  // Warn when average energy is critically low - organisms at risk of dying
  const energyDeathWarning = averageEnergy > 0 && averageEnergy < ENERGY_DEATH_WARNING_THRESHOLD;

  return {
    tickCount,
    elapsedSeconds: tickCount / 30,
    population,
    foodCount: food.length,
    averageGeneration: population ? totals.generation / population : 0,
    averageEnergy,
    speciesCount,
    energyDeathWarning
  };
}

export function formatSimulationStats(stats) {
  const tickCount = toNonNegativeInteger(stats?.tickCount);
  const elapsedSeconds = Math.max(0, toFiniteNumber(stats?.elapsedSeconds));
  const population = toNonNegativeInteger(stats?.population);
  const foodCount = toNonNegativeInteger(stats?.foodCount);
  const averageGeneration = toFiniteNumber(stats?.averageGeneration);
  const averageEnergy = toFiniteNumber(stats?.averageEnergy);
  const speciesCount = toNonNegativeInteger(stats?.speciesCount);
  const energyDeathWarning = Boolean(stats?.energyDeathWarning);

  return {
    tickCount: String(tickCount).padStart(7, '\u00A0'),
    elapsedTime: `${elapsedSeconds.toFixed(1)}s`,
    population: String(population),
    foodCount: String(foodCount),
    averageGeneration: averageGeneration.toFixed(1),
    averageEnergy: averageEnergy.toFixed(1),
    speciesCount: String(speciesCount),
    energyDeathWarning
  };
}

export function reduceStatsTrendHistory(history, stats, maxWindowTicks = STATS_TREND_WINDOW_TICKS) {
  const safeHistory = Array.isArray(history) ? history : [];
  const safeTick = toNonNegativeInteger(stats?.tickCount);

  const nextSample = {
    tick: safeTick,
    population: toNonNegativeInteger(stats?.population),
    foodCount: toNonNegativeInteger(stats?.foodCount),
    averageGeneration: toFiniteNumber(stats?.averageGeneration),
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
    foodCount: deriveMetricTrend(history, safeTick, 'foodCount', FOOD_COUNT_TREND_EPSILON),
    averageGeneration: deriveMetricTrend(history, safeTick, 'averageGeneration', AVERAGE_GENERATION_TREND_EPSILON),
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
