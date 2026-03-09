const INSPECTOR_TRAIT_SECTION_SCHEMA = Object.freeze([
  Object.freeze({
    key: 'identityLifecycle',
    label: 'Identity/Lifecycle',
    fields: Object.freeze([
      Object.freeze({ key: 'id', label: 'ID' }),
      Object.freeze({ key: 'parentId', label: 'Parent' }),
      Object.freeze({ key: 'offspringCount', label: 'Offspring' }),
      Object.freeze({ key: 'generation', label: 'Generation' }),
      Object.freeze({ key: 'age', label: 'Age' })
    ])
  }),
  Object.freeze({
    key: 'movement',
    label: 'Movement',
    fields: Object.freeze([
      Object.freeze({ key: 'position', label: 'Position' }),
      Object.freeze({ key: 'size', label: 'Size' }),
      Object.freeze({ key: 'speed', label: 'Speed' }),
      Object.freeze({ key: 'turnRate', label: 'Turn rate' })
    ])
  }),
  Object.freeze({
    key: 'sensing',
    label: 'Sensing',
    fields: Object.freeze([
      Object.freeze({ key: 'visionRange', label: 'Vision range' }),
      Object.freeze({ key: 'nearestFoodDistance', label: 'Food distance' })
    ])
  }),
  Object.freeze({
    key: 'metabolism',
    label: 'Metabolism',
    fields: Object.freeze([
      Object.freeze({ key: 'energy', label: 'Energy' }),
      Object.freeze({ key: 'metabolism', label: 'Metabolism' })
    ])
  })
]);

function deriveInspectorTraitSections(formattedInspector) {
  return INSPECTOR_TRAIT_SECTION_SCHEMA.map((section) => ({
    key: section.key,
    label: section.label,
    fields: section.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: formattedInspector?.[field.key] ?? '—'
    }))
  }));
}

export {
  INSPECTOR_TRAIT_SECTION_SCHEMA,
  deriveInspectorTraitSections
};
