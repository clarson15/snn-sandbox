import { describe, expect, it } from 'vitest';

import { mapSavedSimulationList } from './api';

describe('mapSavedSimulationList', () => {
  it('maps API fields and orders by updatedAt descending', () => {
    const mapped = mapSavedSimulationList([
      {
        id: 'sim-1',
        name: 'Older run',
        updatedAt: '2026-03-06T12:00:00.000Z'
      },
      {
        id: 'sim-2',
        name: 'Newest run',
        updatedAt: '2026-03-06T12:00:01.000Z'
      }
    ]);

    expect(mapped).toEqual([
      {
        id: 'sim-2',
        name: 'Newest run',
        updatedAt: '2026-03-06T12:00:01.000Z'
      },
      {
        id: 'sim-1',
        name: 'Older run',
        updatedAt: '2026-03-06T12:00:00.000Z'
      }
    ]);
  });
});
