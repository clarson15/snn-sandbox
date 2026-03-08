# Organism Inspector Specification (Deterministic)

## Status
- Ticket: SSN-85
- Purpose: Define a deterministic, implementation-ready data contract and rendering rules for the organism inspector.
- Scope: Specification only (no production UI implementation in this ticket).

## Deterministic Rules (Global)

1. **Snapshot source**
   - Inspector renders from a single immutable simulation snapshot object captured at tick `snapshot.tick`.
   - All fields in one render pass must read from the same snapshot object.
2. **Stable selection key**
   - Selected organism key is `selectedOrganismId` (string).
   - Organism lookup: `snapshot.world.organismsById[selectedOrganismId]`.
3. **No locale formatting**
   - Number formatting MUST NOT use locale APIs (`toLocaleString`, Intl number formatting).
   - Decimal separator is always `.`.
4. **Rounding mode**
   - Round half away from zero via deterministic helper:
     - `roundTo(value, decimals) = sign(value) * floor(abs(value) * 10^decimals + 0.5) / 10^decimals`
5. **Units and precision are fixed per field type**
   - `ratio`: 3 decimals
   - `scalar`: 3 decimals
   - `distance`: 2 decimals + `u`
   - `angle`: 1 decimal + `°`
   - `percent`: 1 decimal + `%`
   - `count/index/generation`: integer (no decimals)
   - `tick`: integer
6. **Fallback semantics**
   - Missing/unavailable numeric value: em dash `—`
   - Missing/unavailable text value: `Unknown`
   - Empty list: `[]`

## Inspector Section Order (Fixed)

Render sections in this exact order:
1. Identity
2. Lifecycle
3. Energy
4. Physical Traits
5. Genome
6. Brain Summary

---

## Section Specifications

### 1) Identity

| Field | Source path | Label | Type / unit | Formatting | Fallback |
|---|---|---|---|---|---|
| Organism ID | `organism.id` | `Organism ID` | text | raw string | `Unknown` |
| Species Tag | `organism.speciesTag` | `Species` | text | raw string | `Unknown` |
| Position X | `organism.position.x` | `Position X` | scalar (`u`) | 2 decimals | `—` |
| Position Y | `organism.position.y` | `Position Y` | scalar (`u`) | 2 decimals | `—` |
| Heading | `organism.headingDegrees` | `Heading` | angle | 1 decimal + `°` | `—` |

### 2) Lifecycle

| Field | Source path | Label | Type / unit | Formatting | Fallback |
|---|---|---|---|---|---|
| Alive | `organism.isAlive` | `Alive` | boolean | `Yes` / `No` | `Unknown` |
| Age Ticks | `organism.ageTicks` | `Age` | tick | integer | `—` |
| Generation | `organism.generation` | `Generation` | generation | integer | `—` |
| Birth Tick | `organism.birthTick` | `Birth Tick` | tick | integer | `—` |
| Last Update Tick | `organism.lastUpdatedTick` | `Last Update` | tick | integer | `—` |

### 3) Energy

| Field | Source path | Label | Type / unit | Formatting | Fallback |
|---|---|---|---|---|---|
| Current Energy | `organism.energy.current` | `Current Energy` | scalar (`eu`) | 3 decimals | `—` |
| Max Energy | `organism.energy.max` | `Max Energy` | scalar (`eu`) | 3 decimals | `—` |
| Reproduction Threshold | `organism.energy.reproductionThreshold` | `Reproduction Threshold` | scalar (`eu`) | 3 decimals | `—` |
| Energy Ratio | derived: `current / max` when `max > 0` | `Energy Ratio` | ratio | 3 decimals | `—` |

### 4) Physical Traits

| Field | Source path | Label | Type / unit | Formatting | Fallback |
|---|---|---|---|---|---|
| Size | `organism.traits.size` | `Size` | scalar | 3 decimals | `—` |
| Speed | `organism.traits.speed` | `Speed` | scalar (`u/tick`) | 3 decimals | `—` |
| Vision Range | `organism.traits.visionRange` | `Vision Range` | distance | 2 decimals + `u` | `—` |
| Turn Rate | `organism.traits.turnRateDegPerTick` | `Turn Rate` | angle (`°/tick`) | 1 decimal + `°/tick` | `—` |
| Metabolism | `organism.traits.metabolism` | `Metabolism` | scalar (`eu/tick`) | 3 decimals | `—` |

### 5) Genome

| Field | Source path | Label | Type / unit | Formatting | Fallback |
|---|---|---|---|---|---|
| Genome ID | `organism.genome.id` | `Genome ID` | text | raw string | `Unknown` |
| Genome Version | `organism.genome.version` | `Genome Version` | integer | integer | `—` |
| Synapse Count | `organism.genome.synapses.length` | `Synapses` | count | integer | `0` |
| Hidden Neuron Count | `organism.genome.hiddenNeurons.length` | `Hidden Neurons` | count | integer | `0` |
| Mutation Rate | `organism.genome.mutationRate` | `Mutation Rate` | percent | multiply by 100, 1 decimal + `%` | `—` |

### 6) Brain Summary

| Field | Source path | Label | Type / unit | Formatting | Fallback |
|---|---|---|---|---|---|
| Input Neurons | `organism.brain.inputCount` | `Input Neurons` | count | integer | `0` |
| Hidden Neurons | `organism.brain.hiddenCount` | `Hidden Neurons` | count | integer | `0` |
| Output Neurons | `organism.brain.outputCount` | `Output Neurons` | count | integer | `0` |
| Active Spikes (tick) | `organism.brain.activeSpikeCount` | `Active Spikes` | count | integer | `0` |
| Mean Synapse Weight | derived from `organism.genome.synapses[].weight` | `Mean Weight` | scalar | 3 decimals | `—` |

---

## Death / Missing / Stale Snapshot Behavior

1. **Selected organism no longer exists in current snapshot**
   - Keep the inspector open with previous `selectedOrganismId`.
   - Show status banner: `Organism unavailable in current snapshot`.
   - Freeze last resolved values from previous valid snapshot for up to `staleGraceTicks = 30`.
2. **After stale grace window expires**
   - Keep section structure and labels intact.
   - Replace values with field fallback values.
   - Show status: `No recent data`.
3. **Organism marked dead (`isAlive = false`) but still present**
   - Continue rendering latest values, `Alive = No`.
   - Do not clear values unless organism disappears or stale rules trigger.
4. **No UI jitter requirement**
   - Section order and row order never change.
   - Missing fields render fallback placeholders in place (no row insertion/removal).
   - Numeric text width should be stabilized in implementation (monospace optional, fixed-width tabular numerals preferred).

---

## Canonical Example (Fixture)

### Example snapshot payload (minimal)

```json
{
  "tick": 4200,
  "world": {
    "organismsById": {
      "org-0007": {
        "id": "org-0007",
        "speciesTag": "alpha",
        "position": { "x": 10.125, "y": 200.5 },
        "headingDegrees": -45.04,
        "isAlive": true,
        "ageTicks": 315,
        "generation": 12,
        "birthTick": 3885,
        "lastUpdatedTick": 4200,
        "energy": {
          "current": 87.654321,
          "max": 120,
          "reproductionThreshold": 90
        },
        "traits": {
          "size": 1.23456,
          "speed": 2.34567,
          "visionRange": 140.126,
          "turnRateDegPerTick": 7.66,
          "metabolism": 0.12349
        },
        "genome": {
          "id": "g-12-a",
          "version": 3,
          "mutationRate": 0.075,
          "hiddenNeurons": [{"id":"h1"},{"id":"h2"}],
          "synapses": [
            { "weight": 0.5 },
            { "weight": -0.25 },
            { "weight": 0.125 }
          ]
        },
        "brain": {
          "inputCount": 5,
          "hiddenCount": 2,
          "outputCount": 5,
          "activeSpikeCount": 4
        }
      }
    }
  }
}
```

### Expected rendered values

- Identity
  - Organism ID: `org-0007`
  - Species: `alpha`
  - Position X: `10.13`
  - Position Y: `200.50`
  - Heading: `-45.0°`
- Lifecycle
  - Alive: `Yes`
  - Age: `315`
  - Generation: `12`
  - Birth Tick: `3885`
  - Last Update: `4200`
- Energy
  - Current Energy: `87.654`
  - Max Energy: `120.000`
  - Reproduction Threshold: `90.000`
  - Energy Ratio: `0.730`
- Physical Traits
  - Size: `1.235`
  - Speed: `2.346`
  - Vision Range: `140.13u`
  - Turn Rate: `7.7°/tick`
  - Metabolism: `0.123`
- Genome
  - Genome ID: `g-12-a`
  - Genome Version: `3`
  - Synapses: `3`
  - Hidden Neurons: `2`
  - Mutation Rate: `7.5%`
- Brain Summary
  - Input Neurons: `5`
  - Hidden Neurons: `2`
  - Output Neurons: `5`
  - Active Spikes: `4`
  - Mean Weight: `0.125`

---

## Implementation Notes for Follow-up Tickets

- Add deterministic formatter utilities in one shared module and forbid ad hoc number formatting in components.
- Build fixture-based tests using the canonical payload above.
- Include regression tests for stale/death behavior to guarantee no row-order jitter.
