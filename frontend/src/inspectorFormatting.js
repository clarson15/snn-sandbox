const INSPECTOR_PLACEHOLDER = '—';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatFixed(value, digits) {
  if (!isFiniteNumber(value)) {
    return INSPECTOR_PLACEHOLDER;
  }

  return value.toFixed(digits);
}

function formatInteger(value) {
  if (!Number.isInteger(value)) {
    return INSPECTOR_PLACEHOLDER;
  }

  return String(value);
}

function formatPosition(x, y) {
  const formattedX = formatFixed(x, 3);
  const formattedY = formatFixed(y, 3);

  if (formattedX === INSPECTOR_PLACEHOLDER || formattedY === INSPECTOR_PLACEHOLDER) {
    return INSPECTOR_PLACEHOLDER;
  }

  return `(${formattedX}, ${formattedY})`;
}

function formatFoodDistance(value) {
  return formatFixed(value, 3);
}

function resolveParentId(organism) {
  const parentId = organism?.lineage?.parentId ?? organism?.parentId;
  if (typeof parentId === 'string' && parentId.trim().length > 0) {
    return parentId;
  }

  return INSPECTOR_PLACEHOLDER;
}

function resolveOffspringCount(organism) {
  const lineageCount = organism?.lineage?.offspringCount;
  if (Number.isInteger(lineageCount) && lineageCount >= 0) {
    return String(lineageCount);
  }

  const directCount = organism?.offspringCount;
  if (Number.isInteger(directCount) && directCount >= 0) {
    return String(directCount);
  }

  const offspringIds = organism?.offspringIds;
  if (Array.isArray(offspringIds)) {
    return String(offspringIds.length);
  }

  return INSPECTOR_PLACEHOLDER;
}

function formatInspectorSnapshot(organism, nearestFoodDistance) {
  return {
    id: typeof organism?.id === 'string' && organism.id.trim().length > 0 ? organism.id : INSPECTOR_PLACEHOLDER,
    generation: formatInteger(organism?.generation),
    parentId: resolveParentId(organism),
    offspringCount: resolveOffspringCount(organism),
    age: formatInteger(organism?.age),
    energy: formatFixed(organism?.energy, 3),
    position: formatPosition(organism?.x, organism?.y),
    nearestFoodDistance: formatFoodDistance(nearestFoodDistance),
    size: formatFixed(organism?.traits?.size, 3),
    speed: formatFixed(organism?.traits?.speed, 3),
    visionRange: formatFixed(organism?.traits?.visionRange, 3),
    turnRate: formatFixed(organism?.traits?.turnRate, 3),
    metabolism: formatFixed(organism?.traits?.metabolism, 3),
    neuronCount: formatInteger(organism?.brain?.neurons?.length),
    synapseCount: formatInteger(organism?.brain?.synapses?.length)
  };
}

export {
  INSPECTOR_PLACEHOLDER,
  formatFixed,
  formatFoodDistance,
  formatInspectorSnapshot
};
