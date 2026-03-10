# Replay parity runtime budget modes

`frontend/src/simulation/replay.test.js` enforces deterministic parity and a runtime budget gate.

## Budget policy

The budget policy is resolved in `readReplayRuntimeBudgetPolicy()`.

- **strict mode**
  - Intended for CI and cross-host baseline checks.
  - Uses `REPLAY_PARITY_STRICT_BUDGET_MS` (default: `1000`).
- **local mode**
  - Intended for deterministic local development where slower host classes (for example ARM64) are expected.
  - Uses strict budget × local multiplier.

Mode resolution:

1. If `REPLAY_PARITY_BUDGET_MODE` is `strict` or `local`, that explicit mode is used.
2. Else, mode is `strict` when `CI=true`.
3. Else, mode is `local`.

Host-class defaults:

- `linux-arm64` local multiplier: `1.8`
- all other host classes local multiplier: `1.35`

## Environment controls

- `REPLAY_PARITY_BUDGET_MODE` = `strict` | `local`
- `REPLAY_PARITY_STRICT_BUDGET_MS` (or alias `REPLAY_PARITY_BUDGET_STRICT_MS`)
- `REPLAY_PARITY_LOCAL_BUDGET_MULTIPLIER`
- `REPLAY_PARITY_BUDGET_MS` (absolute override for emergency triage)

All controls are environment-only; no test source edits are required.

## How to run

From `frontend/`:

```bash
# strict budget locally (CI-equivalent)
REPLAY_PARITY_BUDGET_MODE=strict npm run test -- src/simulation/replay.test.js

# local budget policy (default when CI is not true)
REPLAY_PARITY_BUDGET_MODE=local npm run test -- src/simulation/replay.test.js
```

## Interpreting runtime budget failures

Budget failures throw `[REPLAY_RUNTIME_BUDGET]` and include a runtime context block:

- budget mode
- host class (`platform-arch`)
- platform + architecture
- Node + Dotnet version (if available)
- CI flag
- strict budget, local multiplier, and whether a direct budget override was used

Use this metadata to compare failures across CI x64 Linux and local ARM64 Linux without weakening parity assertions.

## Replay divergence artifact

On parity mismatch failures, replay tests also emit a JSON artifact for fast triage. See `docs/replay-parity-divergence-artifact.md` for schema and example payload.
