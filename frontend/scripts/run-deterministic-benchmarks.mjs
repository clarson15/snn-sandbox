import { runBenchmarkSuite } from './benchmark-runner.mjs';

function formatMs(value) {
  return `${value.toFixed(3)}ms`;
}

function printReport(report) {
  console.log(`Running deterministic benchmark scenarios (${report.ticks} ticks each)\n`);

  for (const scenarioResult of report.scenarios) {
    const { scenario, candidate, baseline, deterministicMatch, modeParity, speedupPercent } = scenarioResult;
    console.log(`Scenario: ${scenario.name}`);
    console.log(`  Seed: ${scenario.seed}`);
    console.log(`  Population: ${scenario.initialPopulation}`);
    console.log(
      `  Spatial run #1 total: ${formatMs(candidate.runA.elapsedMs)} | avg/tick: ${formatMs(candidate.runA.averageTickMs)} | ticks/sec: ${candidate.runA.ticksPerSecond.toFixed(2)}`
    );
    console.log(
      `  Spatial run #2 total: ${formatMs(candidate.runB.elapsedMs)} | avg/tick: ${formatMs(candidate.runB.averageTickMs)} | ticks/sec: ${candidate.runB.ticksPerSecond.toFixed(2)}`
    );
    console.log(
      `  Legacy lookup total: ${formatMs(baseline.run.elapsedMs)} | avg/tick: ${formatMs(baseline.run.averageTickMs)} | ticks/sec: ${baseline.run.ticksPerSecond.toFixed(2)}`
    );
    console.log(`  Spatial deterministic checksum run #1: ${candidate.runA.checksum}`);
    console.log(`  Spatial deterministic checksum run #2: ${candidate.runB.checksum}`);
    console.log(`  Legacy deterministic checksum: ${baseline.run.checksum}`);
    console.log(`  Spatial deterministic match: ${deterministicMatch ? 'YES' : 'NO'}`);
    console.log(`  Spatial/legacy parity: ${modeParity ? 'YES' : 'NO'}`);
    console.log(`  Spatial lookup speedup vs legacy: ${speedupPercent.toFixed(2)}%`);
    console.log('');
  }
}

const report = runBenchmarkSuite();
printReport(report);

if (report.summary.hasMismatch) {
  console.error('Deterministic benchmark failed: checksum mismatch detected between repeated spatial runs or spatial/legacy parity.');
  process.exitCode = 1;
} else {
  console.log('Deterministic benchmark complete: all scenario checksums matched.');
}
