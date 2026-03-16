import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReplayRuntimeBudgetReport,
  readReplayRuntimeBudgetPolicy
} from './replayRuntimeBudget';

const ORIGINAL_ENV = { ...process.env };

describe('replayRuntimeBudget', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('resolves strict mode when explicitly requested', () => {
    process.env.REPLAY_PARITY_BUDGET_MODE = 'strict';
    process.env.REPLAY_PARITY_STRICT_BUDGET_MS = '1234';
    delete process.env.REPLAY_PARITY_LOCAL_BUDGET_MULTIPLIER;
    delete process.env.REPLAY_PARITY_BUDGET_MS;

    const policy = readReplayRuntimeBudgetPolicy();
    expect(policy.mode).toBe('strict');
    expect(policy.budgetMs).toBe(1234);
    expect(policy.strictBudgetMs).toBe(1234);
  });

  it('defaults strict mode CI budget to 1900ms when no overrides are set', () => {
    process.env.CI = 'true';
    delete process.env.REPLAY_PARITY_BUDGET_MODE;
    delete process.env.REPLAY_PARITY_STRICT_BUDGET_MS;
    delete process.env.REPLAY_PARITY_BUDGET_STRICT_MS;
    delete process.env.REPLAY_PARITY_BUDGET_MS;

    const policy = readReplayRuntimeBudgetPolicy();
    expect(policy.mode).toBe('strict');
    expect(policy.strictBudgetMs).toBe(1900);
    expect(policy.budgetMs).toBe(1900);
  });

  it('reports runtime metadata fields in budget summary output', () => {
    const summary = buildReplayRuntimeBudgetReport({
      fixtureTimingsMs: [
        { name: 'fixture-a', durationMs: 101.1 },
        { name: 'fixture-b', durationMs: 98.9 }
      ],
      budgetMs: 250,
      policy: {
        mode: 'local',
        hostClass: 'linux-arm64',
        strictBudgetMs: 1000,
        localBudgetMultiplier: 1.8,
        hasExplicitBudgetOverride: false,
        runtimeEnvironment: {
          platform: 'linux',
          arch: 'arm64',
          nodeVersion: 'v24.0.0',
          dotnetVersion: '9.0.100',
          ci: false
        }
      }
    });

    expect(summary.report).toContain('Budget mode: local');
    expect(summary.report).toContain('Host class: linux-arm64');
    expect(summary.report).toContain('Node: v24.0.0');
    expect(summary.report).toContain('Dotnet: 9.0.100');
  });
});
