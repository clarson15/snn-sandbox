# Replay parity divergence artifact (JSON)

When `frontend/src/simulation/replay.test.js` detects replay parity drift, it now writes a compact machine-readable artifact:

- default path: `frontend/test-results/replay-parity-failure-artifact.json`
- override with env: `REPLAY_PARITY_FAILURE_ARTIFACT_PATH`

The thrown test error prints the resolved artifact path so CI logs point directly to the file.

## Schema (`schemaVersion: 1.0.0`)

```json
{
  "schemaVersion": "1.0.0",
  "failures": [
    {
      "fixture": "dense-collision-tie-break-ordering [phase=milestone-checkpoint]",
      "profile": "dense-collision",
      "seed": "fixture-dense-collision-tie-break-ordering",
      "tick": 120,
      "entityId": "org-0007",
      "mismatchFields": [
        {
          "path": "snapshot.organisms[7].energy",
          "expected": 93.48,
          "actual": 93.41
        }
      ],
      "firstDivergenceSnapshot": {
        "path": "snapshot.organisms[7].energy",
        "expectedValue": 93.48,
        "actualValue": 93.41
      },
      "firstMismatchPath": "snapshot.organisms[7].energy",
      "expectedDigest": "a1b2c3d4",
      "actualDigest": "b2c3d4e5",
      "expectedFingerprint": "a1b2c3d4",
      "actualFingerprint": "b2c3d4e5",
      "eventOrderingDiffSummary": ""
    }
  ]
}
```

## Notes

- Artifact contents are deterministic (no timestamps).
- `mismatchFields` is intentionally capped to keep artifact size bounded for CI.
- `entityId` is populated when the first mismatch maps to an organism/food entry with an id.
