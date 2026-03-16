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

function readNonEmptyEnv(key) {
  const value = process?.env?.[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPositiveEnvNumber(key) {
  const raw = readNonEmptyEnv(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectReplayRuntimeEnvironment() {
  return {
    platform: process?.platform ?? 'unknown',
    arch: process?.arch ?? 'unknown',
    nodeVersion: process?.version ?? 'unknown',
    dotnetVersion: readNonEmptyEnv('DOTNET_VERSION') ?? 'unknown',
    ci: readNonEmptyEnv('CI') === 'true'
  };
}

function resolveBudgetMode(runtimeEnvironment) {
  const explicitMode = readNonEmptyEnv('REPLAY_PARITY_BUDGET_MODE');
  if (explicitMode === 'strict' || explicitMode === 'local') {
    return explicitMode;
  }

  if (runtimeEnvironment.ci) {
    return 'strict';
  }

  return 'local';
}

function resolveHostClass(runtimeEnvironment) {
  return `${runtimeEnvironment.platform}-${runtimeEnvironment.arch}`;
}

function defaultLocalMultiplierForHostClass(hostClass) {
  if (hostClass === 'linux-arm64') {
    return 1.8;
  }

  if (hostClass === 'darwin-arm64') {
    return 2.3;
  }

  return 1.35;
}

export function readReplayRuntimeBudgetPolicy(defaultStrictBudgetMs = 1900) {
  const runtimeEnvironment = detectReplayRuntimeEnvironment();
  const hostClass = resolveHostClass(runtimeEnvironment);
  const mode = resolveBudgetMode(runtimeEnvironment);

  const strictBudgetMs = readPositiveEnvNumber('REPLAY_PARITY_STRICT_BUDGET_MS')
    ?? readPositiveEnvNumber('REPLAY_PARITY_BUDGET_STRICT_MS')
    ?? defaultStrictBudgetMs;

  const localMultiplier = readPositiveEnvNumber('REPLAY_PARITY_LOCAL_BUDGET_MULTIPLIER')
    ?? defaultLocalMultiplierForHostClass(hostClass);

  const modeBudgetMs = mode === 'strict'
    ? strictBudgetMs
    : strictBudgetMs * localMultiplier;

  const overrideBudgetMs = readPositiveEnvNumber('REPLAY_PARITY_BUDGET_MS');
  const budgetMs = overrideBudgetMs ?? modeBudgetMs;

  return {
    budgetMs: toFixedMs(budgetMs),
    mode,
    hostClass,
    runtimeEnvironment,
    strictBudgetMs: toFixedMs(strictBudgetMs),
    localBudgetMultiplier: toFixedMs(localMultiplier),
    hasExplicitBudgetOverride: overrideBudgetMs !== null
  };
}

export function readReplayRuntimeBudgetMs(defaultBudgetMs = 1900) {
  return readReplayRuntimeBudgetPolicy(defaultBudgetMs).budgetMs;
}

export function measureReplayFixtureRuntimeMs(work) {
  const startMs = monotonicNowMs();
  work();
  const endMs = monotonicNowMs();
  return toFixedMs(endMs - startMs);
}

function formatRuntimeContext(policy) {
  const runtime = policy?.runtimeEnvironment ?? {};
  return [
    `Budget mode: ${policy?.mode ?? 'unknown'}`,
    `Host class: ${policy?.hostClass ?? 'unknown'}`,
    `Platform: ${runtime.platform ?? 'unknown'}`,
    `Architecture: ${runtime.arch ?? 'unknown'}`,
    `Node: ${runtime.nodeVersion ?? 'unknown'}`,
    `Dotnet: ${runtime.dotnetVersion ?? 'unknown'}`,
    `CI: ${runtime.ci === true ? 'true' : 'false'}`,
    `Strict budget: ${Number(policy?.strictBudgetMs ?? 0).toFixed(3)}ms`,
    `Local multiplier: ${Number(policy?.localBudgetMultiplier ?? 0).toFixed(3)}`,
    `Explicit budget override: ${policy?.hasExplicitBudgetOverride === true ? 'true' : 'false'}`
  ];
}

export function buildReplayRuntimeBudgetReport({ fixtureTimingsMs, budgetMs, policy = null }) {
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
    ...formatRuntimeContext(policy),
    ...ordered.map((entry, index) => `${String(index + 1).padStart(2, '0')}. ${entry.name}: ${entry.durationMs.toFixed(3)}ms`),
    `Total: ${totalMs.toFixed(3)}ms`,
    `Slowest: ${slowest.map((entry) => `${entry.name}=${entry.durationMs.toFixed(3)}ms`).join(', ')}`
  ];

  return {
    totalMs,
    slowest,
    ordered,
    policy,
    report: lines.join('\n')
  };
}

export function assertReplayRuntimeBudgetWithinThreshold({ fixtureTimingsMs, budgetMs, policy = null }) {
  const summary = buildReplayRuntimeBudgetReport({ fixtureTimingsMs, budgetMs, policy });

  if (summary.totalMs > budgetMs) {
    if (policy?.mode === 'local' && policy?.hasExplicitBudgetOverride !== true) {
      return {
        ...summary,
        exceededBudget: true,
        advisoryOnly: true
      };
    }

    throw new Error(`[REPLAY_RUNTIME_BUDGET] Replay parity runtime budget exceeded.\n${summary.report}`);
  }

  return {
    ...summary,
    exceededBudget: false,
    advisoryOnly: false
  };
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
