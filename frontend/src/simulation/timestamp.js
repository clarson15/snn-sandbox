export function formatSimulationTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return String(value);
  }

  const iso = parsed.toISOString();
  return `${iso.slice(0, 19).replace('T', ' ')} UTC`;
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * Returns a human-friendly relative time string (e.g., "3 days ago").
 * @param {string|Date} value - ISO date string or Date
 * @returns {string} Human-readable relative time
 */
export function formatRelativeTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return String(value);
  }

  const now = Date.now();
  const then = parsed.getTime();
  const deltaMs = now - then;

  if (deltaMs < 0) {
    return 'just now';
  }

  if (deltaMs < MINUTE_MS) {
    return 'just now';
  }

  if (deltaMs < HOUR_MS) {
    const minutes = Math.floor(deltaMs / MINUTE_MS);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (deltaMs < DAY_MS) {
    const hours = Math.floor(deltaMs / HOUR_MS);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (deltaMs < WEEK_MS) {
    const days = Math.floor(deltaMs / DAY_MS);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  if (deltaMs < MONTH_MS) {
    const weeks = Math.floor(deltaMs / WEEK_MS);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }

  if (deltaMs < YEAR_MS) {
    const months = Math.floor(deltaMs / MONTH_MS);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const years = Math.floor(deltaMs / YEAR_MS);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
