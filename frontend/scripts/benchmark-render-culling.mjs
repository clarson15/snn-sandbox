import { performance } from 'node:perf_hooks';

import { createInitialWorldFromConfig, DEFAULT_CONFIG, normalizeSimulationConfig } from '../src/simulation/config.js';
import { drawWorldSnapshot } from '../src/simulation/renderer.js';

function toStableJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => toStableJson(entry)).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${toStableJson(nested)}`).join(',')}}`;
}

function checksum(value) {
  const input = toStableJson(value);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createMockContext() {
  return {
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    set fillStyle(_value) {},
    set strokeStyle(_value) {},
    set lineWidth(_value) {}
  };
}

function runRenderBenchmark({ enableViewportCulling, frames, world, viewport }) {
  const ctx = createMockContext();
  const beforeChecksum = checksum(world);
  const startedAt = performance.now();

  for (let frame = 0; frame < frames; frame += 1) {
    drawWorldSnapshot(ctx, world, viewport, {
      enableViewportCulling,
      cullPadding: 12
    });
  }

  const elapsedMs = performance.now() - startedAt;
  const afterChecksum = checksum(world);

  return {
    enableViewportCulling,
    elapsedMs,
    averageFrameMs: elapsedMs / frames,
    worldChecksumStable: beforeChecksum === afterChecksum,
    beforeChecksum,
    afterChecksum
  };
}

const frames = Number.parseInt(process.env.RENDER_BENCH_FRAMES ?? '600', 10);
const population = Number.parseInt(process.env.RENDER_BENCH_POPULATION ?? '1500', 10);
const config = normalizeSimulationConfig(
  {
    ...DEFAULT_CONFIG,
    name: 'Render culling benchmark',
    seed: 'render-culling-benchmark-seed',
    worldWidth: 1600,
    worldHeight: 900,
    initialPopulation: population,
    minimumPopulation: Math.max(50, Math.floor(population / 4)),
    initialFoodCount: 1200,
    maxFood: 2200
  },
  'render-culling-benchmark-seed'
);

const world = createInitialWorldFromConfig(config);
const viewport = { width: 800, height: 450 };

const culled = runRenderBenchmark({ enableViewportCulling: true, frames, world, viewport });
const unculled = runRenderBenchmark({ enableViewportCulling: false, frames, world, viewport });
const improvementPercent = ((unculled.averageFrameMs - culled.averageFrameMs) / unculled.averageFrameMs) * 100;

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scenario: {
    seed: config.resolvedSeed,
    population,
    foodCount: world.food.length,
    viewport,
    worldSize: { width: config.worldWidth, height: config.worldHeight },
    frames
  },
  results: {
    culled,
    unculled,
    improvementPercent
  }
};

console.log(JSON.stringify(report, null, 2));

if (!culled.worldChecksumStable || !unculled.worldChecksumStable) {
  console.error('Render benchmark failed deterministic state check: world mutated during rendering.');
  process.exit(1);
}
