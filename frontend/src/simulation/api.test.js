import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteSimulationSnapshot,
  getSimulationSnapshot,
  mapSavedSimulationList,
  saveSimulationSnapshot,
  SnapshotNameConflictError
} from './api';

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
        metadataValid: true,
        updatedAt: '2026-03-06T12:00:01.000Z',
        populationCount: null,
        configSummary: null
      },
      {
        id: 'sim-1',
        name: 'Older run',
        seed: '',
        tickCount: 0,
        metadataValid: true,
        updatedAt: '2026-03-06T12:00:00.000Z',
        populationCount: null,
        configSummary: null
      }
    ]);
  });

  it('derives deterministic population metadata from persisted payload when available', () => {
    const mapped = mapSavedSimulationList([
      {
        id: 'sim-1',
        name: 'With world metadata',
        seed: 'seed-a',
        tickCount: 12,
        updatedAt: '2026-03-06T12:00:00.000Z',
        worldState: {
          organisms: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
        }
      }
    ]);

    expect(mapped[0]).toMatchObject({
      seed: 'seed-a',
      tickCount: 12,
      metadataValid: true,
      populationCount: 3
    });
  });

  it('uses simulation id ascending as deterministic tiebreaker when updatedAt values match', () => {
    const mapped = mapSavedSimulationList([
      { id: 'sim-9', name: 'Nine', updatedAt: '2026-03-06T12:00:00.000Z' },
      { id: 'sim-1', name: 'One', updatedAt: '2026-03-06T12:00:00.000Z' }
    ]);

    expect(mapped.map((item) => item.id)).toEqual(['sim-1', 'sim-9']);
  });

  it('derives deterministic config summary from parameters when available', () => {
    const mapped = mapSavedSimulationList([
      {
        id: 'sim-1',
        name: 'With config metadata',
        updatedAt: '2026-03-06T12:00:00.000Z',
        parameters: {
          worldWidth: 800,
          worldHeight: 480,
          initialPopulation: 20,
          maxFood: 120
        }
      }
    ]);

    expect(mapped[0].configSummary).toBe('800x480 · init pop 20 · max food 120');
  });

  it('marks rows as non-resumable when seed/tick metadata is missing or invalid', () => {
    const mapped = mapSavedSimulationList([
      {
        id: 'sim-invalid',
        name: 'Corrupt metadata',
        seed: '  ',
        tickCount: -1,
        updatedAt: '2026-03-06T12:00:00.000Z'
      }
    ]);

    expect(mapped[0]).toMatchObject({
      seed: '',
      tickCount: 0,
      metadataValid: false
    });
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

  it('throws a typed conflict error with snapshot context when name already exists', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'A saved simulation named "Fixture" already exists.',
        conflictSnapshot: {
          id: 'sim-existing',
          name: 'Fixture',
          seed: 'seed-a',
          tickCount: 42
        }
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await saveSimulationSnapshot({ name: 'Fixture' });
      throw new Error('Expected conflict error');
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotNameConflictError);
      expect(error.conflictingSnapshot).toMatchObject({ id: 'sim-existing', tickCount: 42 });
    }
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

  it('throws a generic error when conflict payload is unreadable', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => {
        throw new Error('broken payload');
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveSimulationSnapshot({})).rejects.toThrow(
      'Name conflict detection failed. A snapshot with this name may already exist.'
    );
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
