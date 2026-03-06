import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSimulationSnapshot, mapSavedSimulationList } from './api';

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

describe('getSimulationSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests a specific snapshot id', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'sim-1' })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getSimulationSnapshot('sim-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/simulations/snapshots/sim-1', expect.any(Object));
    expect(result).toEqual({ id: 'sim-1' });
  });
});
