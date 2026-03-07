import { describe, expect, it } from 'vitest';

import { toastReducer } from './toasts';

describe('toastReducer', () => {
  it('adds toasts and keeps a rolling max of three entries', () => {
    let state = { toasts: [] };

    state = toastReducer(state, {
      type: 'enqueue',
      payload: { id: 'a', message: 'one', variant: 'success', expiresAt: 10 }
    });
    state = toastReducer(state, {
      type: 'enqueue',
      payload: { id: 'b', message: 'two', variant: 'success', expiresAt: 11 }
    });
    state = toastReducer(state, {
      type: 'enqueue',
      payload: { id: 'c', message: 'three', variant: 'warning', expiresAt: 12 }
    });
    state = toastReducer(state, {
      type: 'enqueue',
      payload: { id: 'd', message: 'four', variant: 'error', expiresAt: 13 }
    });

    expect(state.toasts.map((item) => item.id)).toEqual(['b', 'c', 'd']);
  });

  it('coalesces duplicate message+variant by refreshing expiration', () => {
    const state = {
      toasts: [{ id: 'a', message: 'Saved.', variant: 'success', expiresAt: 10 }]
    };

    const next = toastReducer(state, {
      type: 'enqueue',
      payload: { id: 'b', message: 'Saved.', variant: 'success', expiresAt: 20 }
    });

    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0]).toMatchObject({ id: 'a', expiresAt: 20 });
  });

  it('dismisses and expires toasts', () => {
    const state = {
      toasts: [
        { id: 'a', message: 'Saved.', variant: 'success', expiresAt: 10 },
        { id: 'b', message: 'Failed.', variant: 'error', expiresAt: 20 }
      ]
    };

    const afterDismiss = toastReducer(state, { type: 'dismiss', id: 'a' });
    expect(afterDismiss.toasts.map((item) => item.id)).toEqual(['b']);

    const afterExpire = toastReducer(afterDismiss, { type: 'expire', now: 21 });
    expect(afterExpire.toasts).toEqual([]);
  });
});
