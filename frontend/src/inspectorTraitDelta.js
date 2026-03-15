import { formatFixed, INSPECTOR_PLACEHOLDER } from './inspectorFormatting';

const TRAIT_DELTA_FIELDS = Object.freeze([
  Object.freeze({ key: 'size', label: 'size' }),
  Object.freeze({ key: 'speed', label: 'speed' }),
  Object.freeze({ key: 'adolescenceAge', label: 'adolescence_age' }),
  Object.freeze({ key: 'eggHatchTime', label: 'egg_hatch_time' }),
  Object.freeze({ key: 'turnRate', label: 'turn_rate' }),
  Object.freeze({ key: 'visionRange', label: 'vision_range' }),
  Object.freeze({ key: 'metabolism', label: 'metabolism' })
]);

const TRAIT_DELTA_EMPTY_STATE = 'Trait delta unavailable: selected organism has no parent snapshot in the current world state.';

function resolveParentId(organism) {
  const lineageParentId = organism?.lineage?.parentId;
  if (typeof lineageParentId === 'string' && lineageParentId.trim().length > 0) {
    return lineageParentId;
  }

  const directParentId = organism?.parentId;
  if (typeof directParentId === 'string' && directParentId.trim().length > 0) {
    return directParentId;
  }

  return null;
}

function formatSignedDelta(selectedValue, parentValue) {
  if (!Number.isFinite(selectedValue) || !Number.isFinite(parentValue)) {
    return INSPECTOR_PLACEHOLDER;
  }

  const delta = selectedValue - parentValue;
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '±';
  return `${sign}${Math.abs(delta).toFixed(3)}`;
}

function deriveInspectorTraitDeltaModel(selectedOrganism, organisms) {
  const parentId = resolveParentId(selectedOrganism);
  if (!parentId || !Array.isArray(organisms) || organisms.length === 0) {
    return {
      hasParent: false,
      parentId,
      message: TRAIT_DELTA_EMPTY_STATE,
      rows: []
    };
  }

  const parentOrganism = organisms.find((organism) => organism?.id === parentId);
  if (!parentOrganism) {
    return {
      hasParent: false,
      parentId,
      message: TRAIT_DELTA_EMPTY_STATE,
      rows: []
    };
  }

  return {
    hasParent: true,
    parentId,
    message: '',
    rows: TRAIT_DELTA_FIELDS.map((field) => {
      const selectedValue = selectedOrganism?.traits?.[field.key];
      const parentValue = parentOrganism?.traits?.[field.key];

      return {
        key: field.key,
        label: field.label,
        parentDisplay: formatFixed(parentValue, 3),
        selectedDisplay: formatFixed(selectedValue, 3),
        deltaDisplay: formatSignedDelta(selectedValue, parentValue)
      };
    })
  };
}

export {
  TRAIT_DELTA_FIELDS,
  TRAIT_DELTA_EMPTY_STATE,
  deriveInspectorTraitDeltaModel
};
