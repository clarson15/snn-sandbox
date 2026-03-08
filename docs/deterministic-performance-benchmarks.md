# Deterministic Browser Performance Benchmarks

This project includes a deterministic benchmark harness to validate simulation performance and replay consistency at target population sizes.

## Scenarios

The harness runs three fixed-seed scenarios for **300 ticks** each:

- `population-500` (seed: `benchmark-seed-500`)
- `population-1000` (seed: `benchmark-seed-1000`)
- `population-2000` (seed: `benchmark-seed-2000`)

Each scenario uses fixed simulation setup parameters (world size, mutation values, food settings) so runs are reproducible.

## Run locally

From the repository root:

```bash
cd frontend
npm ci
npm run benchmark
```

## Generate baseline vs candidate comparison

Create a baseline JSON report on a known-good commit:

```bash
cd frontend
npm run benchmark:compare -- --output-json ./benchmark-results/baseline.json --output-markdown ./benchmark-results/baseline.md
```

Then generate a candidate report and compare against the baseline:

```bash
cd frontend
npm run benchmark:compare -- --baseline ./benchmark-results/baseline.json --budget-config ./scripts/benchmark-budgets.v1.json --output-json ./benchmark-results/candidate.json --output-markdown ./benchmark-results/candidate.md --regression-threshold 10
```

The comparison JSON contains structured fields for each scenario:

- `comparison.baselineAvgTickMs`
- `comparison.candidateAvgTickMs`
- `comparison.deltaPercent`
- `comparison.regressionThresholdPercent`
- `comparison.isRegression`

`deltaPercent` > threshold marks that scenario as a regression in the report.

## Output and interpretation

For each scenario, the harness prints:

- total runtime for run #1 and run #2
- average milliseconds per tick (`avg/tick`)
- derived throughput (`ticks/sec`)
- deterministic end-state checksum for each run
- whether the checksums matched

Example output structure:

```text
Scenario: population-1000
  Run #1 total: 1234.567ms | avg/tick: 4.115ms | ticks/sec: 242.99
  Run #2 total: 1228.001ms | avg/tick: 4.093ms | ticks/sec: 244.33
  Deterministic checksum run #1: abcdef12
  Deterministic checksum run #2: abcdef12
  Checksum match: YES
```

### Determinism + budget gate

The `npm run benchmark` command exits with a non-zero status if any scenario reports a checksum mismatch.

The comparison command (`npm run benchmark:compare`) is CI-gating by default for:

- determinism mismatches (`deterministicMatch` / `modeParity` failures)
- configured budget violations in `frontend/scripts/benchmark-budgets.v1.json`

Optional baseline regression enforcement remains available via `--strict true`.

## Render cadence policy at runtime speeds

The app now decouples simulation tick execution from canvas render cadence:

- **1x speed**: render every animation frame (baseline visual behavior).
- **2x speed**: render every 2nd frame.
- **5x speed**: render every 3rd frame.
- **10x speed**: render every 4th frame.

Simulation ticks still execute at the selected speed multiplier on each scheduler cycle, so deterministic world evolution remains unchanged for the same seed + setup.

A mismatch means the simulation did not end in the same deterministic state for identical seed + setup, and should be investigated before merging simulation changes.

## Updating performance budgets responsibly

Budget config is versioned at `frontend/scripts/benchmark-budgets.v1.json` and uses per-scenario thresholds.

When changing thresholds:

1. Re-run benchmarks on a clean branch with pinned seeds (`npm run benchmark:compare -- --budget-config ./scripts/benchmark-budgets.v1.json`).
2. Confirm determinism still passes for all scenarios.
3. Capture before/after benchmark JSON in the PR description.
4. Only loosen a threshold when there is a justified product/runtime reason (for example, intentional complexity increase with measurable player benefit).
5. Prefer tightening thresholds after optimizations, and keep headroom small enough to catch real regressions without introducing CI flakiness.

Threshold changes should be reviewed like code changes because they directly affect CI quality gates.
