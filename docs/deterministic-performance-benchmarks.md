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

### Determinism gate

The benchmark command exits with a non-zero status if any scenario reports a checksum mismatch.

## Render cadence policy at runtime speeds

The app now decouples simulation tick execution from canvas render cadence:

- **1x speed**: render every animation frame (baseline visual behavior).
- **2x speed**: render every 2nd frame.
- **5x speed**: render every 3rd frame.
- **10x speed**: render every 4th frame.

Simulation ticks still execute at the selected speed multiplier on each scheduler cycle, so deterministic world evolution remains unchanged for the same seed + setup.

A mismatch means the simulation did not end in the same deterministic state for identical seed + setup, and should be investigated before merging simulation changes.
