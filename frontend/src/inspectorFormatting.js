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

function formatInspectorSnapshot(organism, nearestFoodDistance) {
  return {
    generation: formatInteger(organism?.generation),
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
