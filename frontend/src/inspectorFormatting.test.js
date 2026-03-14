import { describe, expect, it } from 'vitest';

import { formatInspectorSnapshot } from './inspectorFormatting';

describe('formatInspectorSnapshot', () => {
  it('formats numeric inspector values with deterministic fixed precision', () => {
    const formatted = formatInspectorSnapshot(
      {
        id: 'org-42',
        lifeStage: 'egg',
        generation: 3,
        age: 42,
        incubationAge: 5.125,
        energy: 11.23456,
        x: 10,
        y: 20.3333,
        traits: {
          size: 1.2,
          speed: 0.333333,
          adolescenceAge: 75.25,
          eggHatchTime: 6.5,
          visionRange: 99.98765,
          turnRate: 0.12555,
          metabolism: 0.0199
        },
        brain: {
          neurons: [
            { id: 'in-energy', type: 'input' },
            { id: 'n-hidden-1', type: 'hidden' },
            { id: 'out-turn-left', type: 'output' }
          ],
          synapses: [{ id: 's1', sourceId: 'in-energy', targetId: 'out-turn-left' }]
        },
        lineage: {
          parentId: 'org-7',
          offspringCount: 4
        }
      },
      7.89123
    );

    expect(formatted).toEqual({
      id: 'org-42',
      lifeStage: 'egg',
      generation: '3',
      parentId: 'org-7',
      offspringCount: '4',
      age: '42',
      incubationAge: '5.125',
      energy: '11.235',
      position: '(10.000, 20.333)',
      nearestFoodDistance: '7.891',
      size: '1.200',
      speed: '0.333',
      adolescenceAge: '75.250',
      eggHatchTime: '6.500',
      birthMode: 'Egg-laying',
      maturationPeriod: '75.250',
      visionRange: '99.988',
      turnRate: '0.126',
      metabolism: '0.020',
      neuronCount: '3',
      inputNeuronCount: '1',
      hiddenNeuronCount: '1',
      outputNeuronCount: '1',
      synapseCount: '1',
      inputBindings: 'Energy sensor',
      outputBindings: 'Turn left actuator'
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

    expect(formatted.id).toBe('—');
    expect(formatted.generation).toBe('—');
    expect(formatted.lifeStage).toBe('live');
    expect(formatted.parentId).toBe('—');
    expect(formatted.offspringCount).toBe('—');
    expect(formatted.energy).toBe('—');
    expect(formatted.position).toBe('—');
    expect(formatted.nearestFoodDistance).toBe('—');
    expect(formatted.size).toBe('—');
    expect(formatted.birthMode).toBe('—');
    expect(formatted.maturationPeriod).toBe('—');
    expect(formatted.neuronCount).toBe('0');
    expect(formatted.inputBindings).toBe('—');
    expect(formatted.outputBindings).toBe('—');
  });

  it('formats live birth when egg hatch time is zero', () => {
    const formatted = formatInspectorSnapshot(
      {
        traits: {
          adolescenceAge: 24,
          eggHatchTime: 0
        },
        brain: {}
      },
      null
    );

    expect(formatted.birthMode).toBe('Live birth');
    expect(formatted.maturationPeriod).toBe('24.000');
  });
});
