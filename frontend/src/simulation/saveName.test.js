import { describe, expect, it } from 'vitest';

import { generateDeterministicCopyName } from './saveName';

describe('generateDeterministicCopyName', () => {
  it('returns copy 1 when no existing copies are present', () => {
    expect(generateDeterministicCopyName('Fixture snapshot', [
      { name: 'Fixture snapshot' },
      { name: 'Other snapshot' }
    ])).toBe('Fixture snapshot (copy 1)');
  });

  it('returns the smallest available positive copy number deterministically', () => {
    expect(generateDeterministicCopyName('Fixture snapshot', [
      { name: 'Fixture snapshot' },
      { name: 'Fixture snapshot (copy 1)' },
      { name: 'Fixture snapshot (copy 3)' },
      { name: 'Fixture snapshot (copy 4)' }
    ])).toBe('Fixture snapshot (copy 2)');
  });

  it('matches copy names case-insensitively but preserves base-name casing', () => {
    expect(generateDeterministicCopyName('Fixture Snapshot', [
      { name: 'fixture snapshot (copy 1)' },
      { name: 'Fixture Snapshot (copy 2)' }
    ])).toBe('Fixture Snapshot (copy 3)');
  });
});
