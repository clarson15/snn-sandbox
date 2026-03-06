export function mapSavedSimulationList(apiItems) {
  return [...apiItems]
    .map((item) => ({
      id: String(item.id),
      name: String(item.name),
      updatedAt: String(item.updatedAt)
    }))
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
    throw new Error(`Failed to save snapshot (${response.status})`);
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
