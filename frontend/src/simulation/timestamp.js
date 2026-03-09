export function formatSimulationTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return String(value);
  }

  const iso = parsed.toISOString();
  return `${iso.slice(0, 19).replace('T', ' ')} UTC`;
}
