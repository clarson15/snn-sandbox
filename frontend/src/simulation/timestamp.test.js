import { describe, expect, it } from 'vitest';

import { formatSimulationTimestamp } from './timestamp';

describe('formatSimulationTimestamp', () => {
  it('formats ISO timestamps with a normalized UTC display', () => {
    expect(formatSimulationTimestamp('2026-03-09T05:41:00.000Z')).toBe('2026-03-09 05:41:00 UTC');
  });

  it('keeps formatted display deterministic for multiple rows with identical updatedAt values', () => {
    const rows = [
      { id: 'sim-2', updatedAt: '2026-03-09T05:41:00.000Z' },
      { id: 'sim-1', updatedAt: '2026-03-09T05:41:00.000Z' }
    ];

    const formatted = rows.map((row) => formatSimulationTimestamp(row.updatedAt));
    expect(formatted).toEqual(['2026-03-09 05:41:00 UTC', '2026-03-09 05:41:00 UTC']);
  });

  it('returns raw value when timestamp is invalid', () => {
    expect(formatSimulationTimestamp('not-a-date')).toBe('not-a-date');
  });
});
