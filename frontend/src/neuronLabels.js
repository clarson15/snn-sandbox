const INPUT_NEURON_LABELS = Object.freeze({
  'in-energy': 'Energy sensor',
  'in-age': 'Age sensor',
  'in-x': 'X position sensor',
  'in-y': 'Y position sensor',
  'in-direction': 'Heading sine sensor',
  'in-direction-cos': 'Heading cosine sensor',
  'in-size': 'Size sensor',
  'in-speed': 'Speed sensor',
  'in-vision-range': 'Vision range sensor',
  'in-food-distance': 'Food distance sensor',
  'in-food-direction': 'Food direction sensor',
  'in-food-detected': 'Food detected sensor'
});

const OUTPUT_NEURON_LABELS = Object.freeze({
  'out-forward': 'Forward movement actuator',
  'out-move-forward': 'Forward movement actuator',
  'out-move': 'Forward movement actuator',
  'out-turn-left': 'Turn left actuator',
  'out-turn-right': 'Turn right actuator'
});

function humanizeFallbackId(id) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return 'Unknown neuron';
  }

  return id
    .replace(/^[^-]+-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isUsefulFallbackName(name) {
  return typeof name === 'string' && name.length > 0 && /[A-Za-z]/.test(name);
}

export function formatNeuronBindingLabel(id, type) {
  if (type === 'input') {
    if (INPUT_NEURON_LABELS[id]) {
      return INPUT_NEURON_LABELS[id];
    }

    const fallbackName = humanizeFallbackId(id);
    return isUsefulFallbackName(fallbackName) ? `${fallbackName} sensor` : `Input sensor (${id})`;
  }

  if (type === 'output') {
    if (OUTPUT_NEURON_LABELS[id]) {
      return OUTPUT_NEURON_LABELS[id];
    }

    const fallbackName = humanizeFallbackId(id);
    return isUsefulFallbackName(fallbackName) ? `${fallbackName} actuator` : `Output actuator (${id})`;
  }

  if (type === 'hidden') {
    return `Hidden neuron ${id}`;
  }

  return humanizeFallbackId(id);
}

export function formatNeuronBindingList(ids, type, placeholder = '—') {
  if (!Array.isArray(ids) || ids.length === 0) {
    return placeholder;
  }

  const uniqueSortedIds = [...new Set(
    ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
  )].sort((left, right) => left.localeCompare(right));

  if (uniqueSortedIds.length === 0) {
    return placeholder;
  }

  return uniqueSortedIds.map((id) => formatNeuronBindingLabel(id, type)).join(', ');
}
