import { describe, expect, it } from 'vitest';

import { formatInspectorSnapshot } from './inspectorFormatting';

describe('formatInspectorSnapshot', () => {
  it('formats numeric inspector values with deterministic fixed precision', () => {
    const formatted = formatInspectorSnapshot(
      {
        generation: 3,
        age: 42,
        energy: 11.23456,
        x: 10,
        y: 20.3333,
        traits: {
          size: 1.2,
          speed: 0.333333,
          visionRange: 99.98765,
          turnRate: 0.12555,
          metabolism: 0.0199
        },
        brain: {
          neurons: [{ id: 'n1' }, { id: 'n2' }],
          synapses: [{ id: 's1' }]
        }
      },
      7.89123
    );

    expect(formatted).toEqual({
      generation: '3',
      age: '42',
      energy: '11.235',
      position: '(10.000, 20.333)',
      nearestFoodDistance: '7.891',
      size: '1.200',
      speed: '0.333',
      visionRange: '99.988',
      turnRate: '0.126',
      metabolism: '0.020',
      neuronCount: '2',
      synapseCount: '1'
    });
  });

  it('renders explicit placeholders for missing values', () => {
    const formatted = formatInspectorSnapshot(
      {
        traits: {},
        brain: {}
      },
      null
    );

    expect(formatted.generation).toBe('—');
    expect(formatted.energy).toBe('—');
    expect(formatted.position).toBe('—');
    expect(formatted.nearestFoodDistance).toBe('—');
    expect(formatted.size).toBe('—');
    expect(formatted.neuronCount).toBe('—');
  });
});
