import { describe, expect, it } from 'vitest';

import { deriveInspectorTraitSections, INSPECTOR_TRAIT_SECTION_SCHEMA } from './inspectorTraitSchema';

describe('deriveInspectorTraitSections', () => {
  it('returns deterministic section composition and trait ordering', () => {
    const formattedInspector = {
      id: 'org-7',
      lifeStage: 'egg',
      parentId: 'org-3',
      offspringCount: '2',
      generation: '7',
      age: '14',
      incubationAge: '3.000',
      energy: '10.000',
      position: '(12.000, 8.000)',
      size: '1.100',
      speed: '2.200',
      adolescenceAge: '48.000',
      eggHatchTime: '6.000',
      turnRate: '0.300',
      visionRange: '42.000',
      nearestFoodDistance: '9.000',
      metabolism: '0.100',
      neuronCount: '5',
      synapseCount: '8'
    };

    const first = deriveInspectorTraitSections(formattedInspector);
    const second = deriveInspectorTraitSections({ ...formattedInspector });

    expect(first).toEqual(second);
    expect(first.map((section) => section.key)).toEqual([
      'lifecycle',
      'physicalTraits',
      'genomeBrain'
    ]);
    expect(first.map((section) => section.label)).toEqual([
      'Lifecycle',
      'Physical Traits',
      'Genome/Brain'
    ]);

    expect(first.map((section) => section.fields.map((field) => field.key))).toEqual([
      ['id', 'lifeStage', 'parentId', 'offspringCount', 'generation', 'age', 'incubationAge', 'energy'],
      ['position', 'size', 'speed', 'adolescenceAge', 'eggHatchTime', 'turnRate', 'visionRange', 'nearestFoodDistance', 'metabolism'],
      ['neuronCount', 'synapseCount']
    ]);
  });

  it('keeps schema ordering immutable and provides placeholders for missing values', () => {
    const sections = deriveInspectorTraitSections(undefined);

    expect(sections.map((section) => section.key)).toEqual(
      INSPECTOR_TRAIT_SECTION_SCHEMA.map((section) => section.key)
    );
    expect(
      sections.flatMap((section) => section.fields.map((field) => field.value))
    ).toEqual(
      INSPECTOR_TRAIT_SECTION_SCHEMA.flatMap((section) => section.fields.map(() => '—'))
    );
  });
});
