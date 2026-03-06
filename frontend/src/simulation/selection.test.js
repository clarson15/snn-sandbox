import { describe, expect, it } from 'vitest';

import { pickOrganismAtPoint } from './selection';

describe('pickOrganismAtPoint', () => {
  it('uses lexical id tie-break for overlapping equal-distance candidates', () => {
    const organisms = [
      { id: 'org-2', x: 50, y: 50 },
      { id: 'org-1', x: 50, y: 50 }
    ];

    const selected = pickOrganismAtPoint(organisms, 50, 50, 8);

    expect(selected?.id).toBe('org-1');
  });

  it('returns null when no candidate falls within hit radius', () => {
    const organisms = [{ id: 'org-1', x: 10, y: 10 }];

    expect(pickOrganismAtPoint(organisms, 100, 100, 4)).toBeNull();
  });
});
