function toNonNegativeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function derivePopulationCount(item) {
  const directCandidates = [
    item?.populationCount,
    item?.population,
    item?.snapshotMetadata?.population,
    item?.snapshotMetadata?.populationCount
  ];

  for (const candidate of directCandidates) {
    const parsed = toNonNegativeInteger(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  if (Array.isArray(item?.worldState?.organisms)) {
    return item.worldState.organisms.length;
  }

  return null;
}

export function mapSavedSimulationList(apiItems) {
  return [...apiItems]
    .map((item) => {
      const parsedTickCount = toNonNegativeInteger(item.tickCount);

      return {
        id: String(item.id),
        name: String(item.name),
        seed: String(item.seed ?? ''),
        tickCount: parsedTickCount ?? 0,
        updatedAt: String(item.updatedAt),
        populationCount: derivePopulationCount(item)
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSimulationSnapshots() {
  const response = await fetch('/api/simulations/snapshots', {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list snapshots (${response.status})`);
  }

  const payload = await response.json();
  return mapSavedSimulationList(payload);
}

export async function getSimulationSnapshot(snapshotId) {
  const response = await fetch(`/api/simulations/snapshots/${encodeURIComponent(snapshotId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to load snapshot (${response.status})`);
  }

  return response.json();
}

async function getResponseErrorMessage(response, fallbackMessage) {
  try {
    const payload = await response.json();
    const errorMessage = typeof payload?.error === 'string' ? payload.error.trim() : '';
    if (errorMessage) {
      return errorMessage;
    }
  } catch {
    // Ignore non-JSON responses and use fallback.
  }

  return `${fallbackMessage} (${response.status})`;
}

export class SnapshotNameConflictError extends Error {
  constructor(message, conflictingSnapshot) {
    super(message);
    this.name = 'SnapshotNameConflictError';
    this.conflictingSnapshot = conflictingSnapshot;
  }
}

export async function saveSimulationSnapshot(snapshot) {
  const response = await fetch('/api/simulations/snapshots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(snapshot)
  });

  if (response.status === 409) {
    try {
      const payload = await response.json();
      throw new SnapshotNameConflictError(
        payload.error ?? 'A saved simulation with this name already exists.',
        payload.conflictSnapshot ?? null
      );
    } catch (e) {
      if (e instanceof SnapshotNameConflictError) {
        throw e;
      }
      throw new Error('Name conflict detection failed. A snapshot with this name may already exist.');
    }
  }

  if (!response.ok) {
    const errorMessage = await getResponseErrorMessage(response, 'Failed to save snapshot');
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function deleteSimulationSnapshot(snapshotId) {
  const response = await fetch(`/api/simulations/snapshots/${encodeURIComponent(snapshotId)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to delete snapshot (${response.status})`);
  }
}
