import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatRelativeTime, formatSimulationTimestamp } from './timestamp';

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

describe('formatRelativeTime', () => {
  const REAL_CLOCK = Date.now.bind(Date);

  beforeEach(() => {
    // Freeze clock at 2026-03-21T08:47:00.000Z for deterministic tests
    Date.now = () => new Date('2026-03-21T08:47:00.000Z').getTime();
  });

  afterEach(() => {
    Date.now = REAL_CLOCK;
  });

  it('returns "just now" for timestamps within the last minute', () => {
    const recent = new Date('2026-03-21T08:46:30.000Z').toISOString();
    expect(formatRelativeTime(recent)).toBe('just now');
  });

  it('returns pluralized minutes for timestamps within the last hour', () => {
    const minutesAgo = new Date('2026-03-21T08:45:00.000Z').toISOString();
    expect(formatRelativeTime(minutesAgo)).toBe('2 minutes ago');
  });

  it('returns singular "hour" for exactly one hour ago', () => {
    const oneHourAgo = new Date('2026-03-21T07:47:00.000Z').toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });

  it('returns pluralized hours for multiple hours ago', () => {
    const hoursAgo = new Date('2026-03-21T05:47:00.000Z').toISOString();
    expect(formatRelativeTime(hoursAgo)).toBe('3 hours ago');
  });

  it('returns singular "day" for exactly one day ago', () => {
    const oneDayAgo = new Date('2026-03-20T08:47:00.000Z').toISOString();
    expect(formatRelativeTime(oneDayAgo)).toBe('1 day ago');
  });

  it('returns pluralized days for multiple days ago', () => {
    const daysAgo = new Date('2026-03-15T08:47:00.000Z').toISOString();
    expect(formatRelativeTime(daysAgo)).toBe('6 days ago');
  });

  it('returns pluralized weeks for timestamps within a month', () => {
    const weeksAgo = new Date('2026-03-07T08:47:00.000Z').toISOString();
    expect(formatRelativeTime(weeksAgo)).toBe('2 weeks ago');
  });

  it('returns pluralized months for timestamps within a year', () => {
    // 59 days between Jan 21 and Mar 21 = ~2 months, floored to 1 month
    const monthsAgo = new Date('2026-01-21T08:47:00.000Z').toISOString();
    expect(formatRelativeTime(monthsAgo)).toBe('1 month ago');
  });

  it('returns pluralized years for timestamps beyond a year', () => {
    const yearsAgo = new Date('2024-03-21T08:47:00.000Z').toISOString();
    expect(formatRelativeTime(yearsAgo)).toBe('2 years ago');
  });

  it('returns "just now" for future timestamps', () => {
    const future = new Date('2026-03-21T08:48:00.000Z').toISOString();
    expect(formatRelativeTime(future)).toBe('just now');
  });

  it('returns raw value when timestamp is invalid', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
  });
});
