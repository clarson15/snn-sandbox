import { describe, expect, it } from 'vitest';
import { applyPerformanceBudgets, createComparisonReport, runBenchmarkSuite } from './benchmark-runner.mjs';

describe('benchmark runner', () => {
  it('produces deterministic checksums and stable schema for deterministic scenarios', () => {
    const report = runBenchmarkSuite({
      ticks: 50,
      scenarios: [
        {
          name: 'test-population',
          seed: 'test-seed',
          initialPopulation: 50,
          minimumPopulation: 10,
          initialFoodCount: 50,
          maxFood: 120
        }
      ]
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.ticks).toBe(50);
    expect(Array.isArray(report.scenarios)).toBe(true);
    expect(report.scenarios).toHaveLength(1);

    const scenario = report.scenarios[0];
    expect(scenario.scenario.name).toBe('test-population');
    expect(scenario.deterministicMatch).toBe(true);
    expect(scenario.modeParity).toBe(true);
    expect(typeof scenario.candidate.runA.averageTickMs).toBe('number');
    expect(typeof scenario.candidate.runA.checksum).toBe('string');
  });

  it('computes baseline vs candidate comparison fields', () => {
    const baseline = runBenchmarkSuite({
      ticks: 25,
      scenarios: [
        {
          name: 'compare-population',
          seed: 'compare-seed',
          initialPopulation: 40,
          minimumPopulation: 8,
          initialFoodCount: 30,
          maxFood: 80
        }
      ]
    });

    const candidate = runBenchmarkSuite({
      ticks: 25,
      scenarios: [
        {
          name: 'compare-population',
          seed: 'compare-seed',
          initialPopulation: 40,
          minimumPopulation: 8,
          initialFoodCount: 30,
          maxFood: 80
        }
      ]
    });

    const comparison = createComparisonReport({ baselineReport: baseline, candidateReport: candidate, regressionThresholdPercent: 5 });

    expect(comparison.schemaVersion).toBe(1);
    expect(comparison.summary.scenarioCount).toBe(1);
    expect(comparison.scenarios[0].comparison).toEqual(
      expect.objectContaining({
        baselineAvgTickMs: expect.any(Number),
        candidateAvgTickMs: expect.any(Number),
        candidateTicksPerSecond: expect.any(Number),
        regressionThresholdPercent: 5,
        isRegression: expect.any(Boolean)
      })
    );
  });

  it('evaluates per-scenario performance budgets', () => {
    const report = createComparisonReport({
      candidateReport: runBenchmarkSuite({
        ticks: 10,
        scenarios: [
          {
            name: 'budget-population',
            seed: 'budget-seed',
            initialPopulation: 20,
            minimumPopulation: 5,
            initialFoodCount: 20,
            maxFood: 40
          }
        ]
      })
    });

    const budgeted = applyPerformanceBudgets(report, {
      schemaVersion: 1,
      scenarios: {
        'budget-population': {
          maxAverageTickMs: 100,
          minTicksPerSecond: 1
        }
      }
    });

    expect(budgeted.summary.budgetFailureCount).toBe(0);
    expect(budgeted.scenarios[0].comparison.budget).toEqual(
      expect.objectContaining({
        configured: true,
        isWithinBudget: true,
        violations: []
      })
    );
  });
});
