import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteSimulationSnapshot, getSimulationSnapshot, mapSavedSimulationList, saveSimulationSnapshot } from './api';

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
        seed: '',
        tickCount: 0,
        updatedAt: '2026-03-06T12:00:01.000Z'
      },
      {
        id: 'sim-1',
        name: 'Older run',
        seed: '',
        tickCount: 0,
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

describe('saveSimulationSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces backend error details for actionable retries', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Snapshot payload missing world_state.' })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveSimulationSnapshot({})).rejects.toThrow('Snapshot payload missing world_state.');
  });

  it('falls back to status code when backend error payload is unavailable', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveSimulationSnapshot({})).rejects.toThrow('Failed to save snapshot (500)');
  });
});

describe('deleteSimulationSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes by stable snapshot id', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => ({})
    }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteSimulationSnapshot('sim-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/simulations/snapshots/sim-1', expect.objectContaining({ method: 'DELETE' }));
  });
});
