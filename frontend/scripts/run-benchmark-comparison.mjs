import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createComparisonReport, runBenchmarkSuite } from './benchmark-runner.mjs';

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
    '',
    '| Scenario | Deterministic | Mode parity | Candidate avg/tick (ms) | Baseline avg/tick (ms) | Delta % | Regression |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |'
  ];

  for (const entry of report.scenarios) {
    const { scenario, deterministicMatch, modeParity, comparison } = entry;
    lines.push(
      `| ${scenario.name} | ${deterministicMatch ? 'YES' : 'NO'} | ${modeParity ? 'YES' : 'NO'} | ${comparison.candidateAvgTickMs.toFixed(3)} | ${
        comparison.baselineAvgTickMs == null ? 'N/A' : comparison.baselineAvgTickMs.toFixed(3)
      } | ${comparison.deltaPercent == null ? 'N/A' : `${comparison.deltaPercent.toFixed(2)}%`} | ${comparison.isRegression ? 'YES' : 'NO'} |`
    );
  }

  lines.push('');
  lines.push('> Note: This report is informational by default and does not fail CI for regressions unless strict mode is enabled.');
  return `${lines.join('\n')}\n`;
}

async function loadBaseline(path) {
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
  const strictMode = args.get('strict') === 'true';

  const candidateReport = runBenchmarkSuite({ ticks });
  const baselineReport = await loadBaseline(baselinePath);
  const comparisonReport = createComparisonReport({
    baselineReport,
    candidateReport,
    regressionThresholdPercent: threshold
  });

  await mkdir(dirname(outputJsonPath), { recursive: true });
  await mkdir(dirname(outputMarkdownPath), { recursive: true });

  await writeFile(outputJsonPath, `${JSON.stringify(comparisonReport, null, 2)}\n`, 'utf8');
  await writeFile(outputMarkdownPath, toMarkdownSummary(comparisonReport), 'utf8');

  console.log(`Wrote benchmark comparison JSON: ${outputJsonPath}`);
  console.log(`Wrote benchmark comparison markdown: ${outputMarkdownPath}`);

  if (comparisonReport.summary.hasMismatch) {
    console.error('Determinism mismatch detected in benchmark scenarios.');
    if (strictMode) {
      process.exitCode = 1;
    }
  }

  if (comparisonReport.summary.regressionCount > 0) {
    console.warn('Benchmark regressions exceeded threshold in one or more scenarios.');
    if (strictMode) {
      process.exitCode = 1;
    }
  }
}

main();
