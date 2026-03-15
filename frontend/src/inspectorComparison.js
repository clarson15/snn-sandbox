const COMPARISON_FIELDS = [
  { key: 'generation', label: 'Generation', path: ['generation'], precision: 0 },
  { key: 'age', label: 'Age', path: ['age'], precision: 0 },
  { key: 'energy', label: 'Energy', path: ['energy'], precision: 3 },
  { key: 'size', label: 'Size', path: ['traits', 'size'] },
  { key: 'speed', label: 'Speed', path: ['traits', 'speed'] },
  { key: 'adolescenceAge', label: 'Adolescence', path: ['traits', 'adolescenceAge'] },
  { key: 'eggHatchTime', label: 'Egg hatch', path: ['traits', 'eggHatchTime'] },
  { key: 'turnRate', label: 'Turn rate', path: ['traits', 'turnRate'] },
  { key: 'visionRange', label: 'Vision range', path: ['traits', 'visionRange'] },
  { key: 'metabolism', label: 'Metabolism', path: ['traits', 'metabolism'] }
];

const UNAVAILABLE_LABEL = 'Unavailable';

function getValueAtPath(target, path) {
  return path.reduce((current, key) => (current && Object.hasOwn(current, key) ? current[key] : undefined), target);
}

function formatNumeric(value, precision) {
  return value.toFixed(precision);
}

export function deriveInspectorComparisonRows(selected, pinned) {
  if (!selected || !pinned) {
    return [];
  }

  return COMPARISON_FIELDS.map((field) => {
    const selectedValue = getValueAtPath(selected, field.path);
    const pinnedValue = getValueAtPath(pinned, field.path);
    const precision = field.precision ?? 2;
    const selectedIsNumber = typeof selectedValue === 'number' && Number.isFinite(selectedValue);
    const pinnedIsNumber = typeof pinnedValue === 'number' && Number.isFinite(pinnedValue);

    const selectedDisplay = selectedIsNumber ? formatNumeric(selectedValue, precision) : UNAVAILABLE_LABEL;
    const pinnedDisplay = pinnedIsNumber ? formatNumeric(pinnedValue, precision) : UNAVAILABLE_LABEL;

    let deltaLabel = 'Unavailable on one side';
    if (selectedIsNumber && pinnedIsNumber) {
      const delta = selectedValue - pinnedValue;
      if (delta === 0) {
        deltaLabel = 'No change vs pinned';
      } else {
        const sign = delta > 0 ? '+' : '-';
        deltaLabel = `${sign}${Math.abs(delta).toFixed(precision)} vs pinned`;
      }
    }

    return {
      key: field.key,
      label: field.label,
      selectedDisplay,
      pinnedDisplay,
      deltaLabel
    };
  });
}
