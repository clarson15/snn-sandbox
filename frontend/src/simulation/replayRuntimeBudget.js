function monotonicNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  if (typeof process !== 'undefined' && process?.hrtime?.bigint) {
    return Number(process.hrtime.bigint()) / 1e6;
  }

  return Date.now();
}

function toFixedMs(valueMs) {
  return Number(valueMs.toFixed(3));
}

export function readReplayRuntimeBudgetMs(defaultBudgetMs = 1000) {
  const raw = process?.env?.REPLAY_PARITY_BUDGET_MS;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultBudgetMs;
  }

  return parsed;
}

export function measureReplayFixtureRuntimeMs(work) {
  const startMs = monotonicNowMs();
  work();
  const endMs = monotonicNowMs();
  return toFixedMs(endMs - startMs);
}

export function buildReplayRuntimeBudgetReport({ fixtureTimingsMs, budgetMs }) {
  const ordered = fixtureTimingsMs.map((entry) => ({
    name: entry.name,
    durationMs: toFixedMs(entry.durationMs)
  }));

  const totalMs = toFixedMs(ordered.reduce((sum, entry) => sum + entry.durationMs, 0));

  const slowest = [...ordered]
    .sort((a, b) => (b.durationMs - a.durationMs) || a.name.localeCompare(b.name))
    .slice(0, Math.min(3, ordered.length));

  const lines = [
    `Replay parity runtime budget report (budget=${budgetMs.toFixed(3)}ms)`,
    ...ordered.map((entry, index) => `${String(index + 1).padStart(2, '0')}. ${entry.name}: ${entry.durationMs.toFixed(3)}ms`),
    `Total: ${totalMs.toFixed(3)}ms`,
    `Slowest: ${slowest.map((entry) => `${entry.name}=${entry.durationMs.toFixed(3)}ms`).join(', ')}`
  ];

  return {
    totalMs,
    slowest,
    ordered,
    report: lines.join('\n')
  };
}

export function assertReplayRuntimeBudgetWithinThreshold({ fixtureTimingsMs, budgetMs }) {
  const summary = buildReplayRuntimeBudgetReport({ fixtureTimingsMs, budgetMs });

  if (summary.totalMs > budgetMs) {
    throw new Error(`[REPLAY_RUNTIME_BUDGET] Replay parity runtime budget exceeded.\n${summary.report}`);
  }

  return summary;
}

export function assertReplayFixtureWorkBudgetWithinThreshold({ fixture }) {
  const workBudget = fixture?.workBudget;

  if (!workBudget || workBudget.enabled !== true) {
    return;
  }

  const projectedWorkUnits = Number(fixture?.tickBudget ?? 0) * Number(fixture?.initialPopulation ?? 0);
  const maxWorkUnits = Number(workBudget.maxWorkUnits ?? 0);

  if (!Number.isFinite(projectedWorkUnits) || !Number.isFinite(maxWorkUnits) || projectedWorkUnits <= 0 || maxWorkUnits <= 0) {
    throw new Error(
      `[REPLAY_RUNTIME_BUDGET] Fixture ${fixture?.name ?? '<unknown>'} has invalid deterministic work budget configuration.`
    );
  }

  if (projectedWorkUnits > maxWorkUnits) {
    throw new Error(
      `[REPLAY_RUNTIME_BUDGET] Fixture ${fixture.name} exceeded deterministic work budget: ` +
        `projectedWorkUnits=${projectedWorkUnits} > maxWorkUnits=${maxWorkUnits}. ` +
        `Adjust tickBudget/initialPopulation or explicitly raise workBudget.maxWorkUnits with rationale.`
    );
  }
}
