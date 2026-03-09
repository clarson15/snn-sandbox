const SORT_KEYS = {
  UPDATED_DESC: 'updated-desc',
  UPDATED_ASC: 'updated-asc',
  NAME_ASC: 'name-asc'
};

export const SAVED_SIMULATION_SORT_OPTIONS = [
  { value: SORT_KEYS.UPDATED_DESC, label: 'Updated (newest first)' },
  { value: SORT_KEYS.UPDATED_ASC, label: 'Updated (oldest first)' },
  { value: SORT_KEYS.NAME_ASC, label: 'Name (A→Z)' }
];

export const DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE = {
  sortKey: SORT_KEYS.UPDATED_DESC,
  nameFilter: '',
  selectedSnapshotId: null
};

function compareStrings(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower < bLower) {
    return -1;
  }

  if (aLower > bLower) {
    return 1;
  }

  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

function compareByUpdatedAt(left, right, direction = 'desc') {
  const leftTime = Date.parse(left?.updatedAt ?? '');
  const rightTime = Date.parse(right?.updatedAt ?? '');
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (leftValid && rightValid && leftTime !== rightTime) {
    return direction === 'asc' ? leftTime - rightTime : rightTime - leftTime;
  }

  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }

  const updatedAtTextComparison = compareStrings(left?.updatedAt, right?.updatedAt);
  if (updatedAtTextComparison !== 0) {
    return direction === 'asc' ? updatedAtTextComparison : -updatedAtTextComparison;
  }

  return 0;
}

function compareSavedSimulations(left, right, sortKey) {
  if (sortKey === SORT_KEYS.NAME_ASC) {
    return compareStrings(left?.name, right?.name)
      || compareByUpdatedAt(left, right, 'desc')
      || compareStrings(left?.id, right?.id);
  }

  if (sortKey === SORT_KEYS.UPDATED_ASC) {
    return compareByUpdatedAt(left, right, 'asc')
      || compareStrings(left?.name, right?.name)
      || compareStrings(left?.id, right?.id);
  }

  return compareByUpdatedAt(left, right, 'desc')
    || compareStrings(left?.name, right?.name)
    || compareStrings(left?.id, right?.id);
}

export function deriveSavedSimulationListView(items, viewState = DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE) {
  const sortKey = viewState?.sortKey ?? DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE.sortKey;
  const normalizedFilter = String(viewState?.nameFilter ?? '').trim().toLowerCase();

  const visibleItems = [...(Array.isArray(items) ? items : [])]
    .filter((item) => {
      if (!normalizedFilter) {
        return true;
      }

      return String(item?.name ?? '').toLowerCase().includes(normalizedFilter);
    })
    .sort((left, right) => compareSavedSimulations(left, right, sortKey));

  const selectedStillVisible = visibleItems.some((item) => item.id === viewState?.selectedSnapshotId);
  const selectedSnapshotId = selectedStillVisible
    ? viewState.selectedSnapshotId
    : (visibleItems[0]?.id ?? null);

  return {
    sortKey,
    nameFilter: viewState?.nameFilter ?? '',
    selectedSnapshotId,
    visibleItems
  };
}
