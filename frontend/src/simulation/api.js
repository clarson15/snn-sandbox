export function mapSavedSimulationList(apiItems) {
  return [...apiItems]
    .map((item) => {
      const parsedTickCount = Number.parseInt(item.tickCount, 10);

      return {
        id: String(item.id),
        name: String(item.name),
        seed: String(item.seed ?? ''),
        tickCount: Number.isInteger(parsedTickCount) && parsedTickCount >= 0 ? parsedTickCount : 0,
        updatedAt: String(item.updatedAt)
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

export async function saveSimulationSnapshot(snapshot) {
  const response = await fetch('/api/simulations/snapshots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(snapshot)
  });

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
