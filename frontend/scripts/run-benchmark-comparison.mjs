import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { applyPerformanceBudgets, createComparisonReport, runBenchmarkSuite } from './benchmark-runner.mjs';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, maybeValue] = token.slice(2).split('=', 2);
    if (maybeValue !== undefined) {
      args.set(rawKey, maybeValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(rawKey, next);
      index += 1;
    } else {
      args.set(rawKey, 'true');
    }
  }
  return args;
}

function toMarkdownSummary(report) {
  const lines = [
    '# Deterministic Benchmark Comparison Summary',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Ticks per scenario: ${report.ticks}`,
    `- Scenario count: ${report.summary.scenarioCount}`,
    `- Determinism mismatches: ${report.summary.hasMismatch ? 'YES' : 'NO'}`,
    `- Regressions over threshold: ${report.summary.regressionCount}`,
    `- Budget violations: ${report.summary.budgetFailureCount}`,
    '',
    '| Scenario | Deterministic | Mode parity | Candidate avg/tick (ms) | Candidate ticks/sec | Budget pass | Baseline avg/tick (ms) | Delta % | Regression |',
    '| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- |'
  ];

  for (const entry of report.scenarios) {
    const { scenario, deterministicMatch, modeParity, comparison } = entry;
    lines.push(
      `| ${scenario.name} | ${deterministicMatch ? 'YES' : 'NO'} | ${modeParity ? 'YES' : 'NO'} | ${comparison.candidateAvgTickMs.toFixed(3)} | ${comparison.candidateTicksPerSecond.toFixed(2)} | ${comparison.budget.isWithinBudget ? 'YES' : 'NO'} | ${
        comparison.baselineAvgTickMs == null ? 'N/A' : comparison.baselineAvgTickMs.toFixed(3)
      } | ${comparison.deltaPercent == null ? 'N/A' : `${comparison.deltaPercent.toFixed(2)}%`} | ${comparison.isRegression ? 'YES' : 'NO'} |`
    );

    if (!comparison.budget.isWithinBudget && comparison.budget.violations.length > 0) {
      lines.push(`| ↳ budget details |  |  |  |  | ${comparison.budget.violations.join('; ')} |  |  |  |`);
    }
  }

  lines.push('');
  lines.push('> This command is CI-gating: determinism mismatches and budget violations fail the run. Regressions vs baseline can be optionally enforced with --strict true.');
  return `${lines.join('\n')}\n`;
}

async function loadJson(path) {
  if (!path) {
    return null;
  }

  const content = await readFile(resolve(path), 'utf8');
  return JSON.parse(content);
}


async function main() {
  const args = parseArgs(process.argv);
  const ticks = Number(args.get('ticks') ?? '300');
  const threshold = Number(args.get('regression-threshold') ?? '10');
  const outputJsonPath = resolve(args.get('output-json') ?? './benchmark-results/benchmark-comparison.json');
  const outputMarkdownPath = resolve(args.get('output-markdown') ?? './benchmark-results/benchmark-summary.md');
  const baselinePath = args.get('baseline');
  const budgetConfigPath = resolve(args.get('budget-config') ?? './scripts/benchmark-budgets.v1.json');
  const strictMode = args.get('strict') === 'true';

  const candidateReport = runBenchmarkSuite({ ticks });
  const baselineReport = await loadJson(baselinePath);
  const budgetConfig = await loadJson(budgetConfigPath);

  const comparisonReport = applyPerformanceBudgets(
    createComparisonReport({
      baselineReport,
      candidateReport,
      regressionThresholdPercent: threshold
    }),
    budgetConfig
  );

  await mkdir(dirname(outputJsonPath), { recursive: true });
  await mkdir(dirname(outputMarkdownPath), { recursive: true });

  await writeFile(outputJsonPath, `${JSON.stringify(comparisonReport, null, 2)}\n`, 'utf8');
  await writeFile(outputMarkdownPath, toMarkdownSummary(comparisonReport), 'utf8');

  console.log(`Wrote benchmark comparison JSON: ${outputJsonPath}`);
  console.log(`Wrote benchmark comparison markdown: ${outputMarkdownPath}`);

  if (comparisonReport.summary.hasMismatch) {
    console.error('Determinism mismatch detected in benchmark scenarios.');
    process.exitCode = 1;
  }

  if (comparisonReport.summary.budgetFailureCount > 0) {
    console.error('Benchmark budget violations detected in one or more scenarios.');
    process.exitCode = 1;
  }

  if (comparisonReport.summary.regressionCount > 0) {
    console.warn('Benchmark regressions exceeded threshold in one or more scenarios.');
    if (strictMode) {
      process.exitCode = 1;
    }
  }
}

main();
