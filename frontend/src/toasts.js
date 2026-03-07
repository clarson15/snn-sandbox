import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const TOAST_LIFETIME_MS = 2400;
const DUPLICATE_WINDOW_MS = 1200;
const MAX_TOASTS = 3;

let toastIdCounter = 0;

export function createToastId() {
  toastIdCounter += 1;
  return `toast-${toastIdCounter}`;
}

export function toastReducer(state, action) {
  if (action.type === 'enqueue') {
    const existing = state.toasts.find(
      (item) => item.message === action.payload.message && item.variant === action.payload.variant
    );

    if (existing) {
      return {
        ...state,
        toasts: state.toasts.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                expiresAt: action.payload.expiresAt
              }
            : item
        )
      };
    }

    const nextToasts = [...state.toasts, action.payload];
    return {
      ...state,
      toasts: nextToasts.slice(-MAX_TOASTS)
    };
  }

  if (action.type === 'dismiss') {
    return {
      ...state,
      toasts: state.toasts.filter((item) => item.id !== action.id)
    };
  }

  if (action.type === 'expire') {
    return {
      ...state,
      toasts: state.toasts.filter((item) => item.expiresAt > action.now)
    };
  }

  return state;
}

export function useToasts() {
  const [state, setState] = useState({ toasts: [] });
  const recentRef = useRef(new Map());

  const enqueueToast = useCallback((message, variant = 'info') => {
    const now = Date.now();
    const dedupeKey = `${variant}:${message}`;
    const recentAt = recentRef.current.get(dedupeKey);
    if (typeof recentAt === 'number' && now - recentAt < DUPLICATE_WINDOW_MS) {
      return;
    }

    recentRef.current.set(dedupeKey, now);
    const payload = {
      id: createToastId(),
      message,
      variant,
      expiresAt: now + TOAST_LIFETIME_MS
    };

    setState((previous) => toastReducer(previous, { type: 'enqueue', payload }));
  }, []);

  const dismissToast = useCallback((id) => {
    setState((previous) => toastReducer(previous, { type: 'dismiss', id }));
  }, []);

  useEffect(() => {
    if (state.toasts.length === 0) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setState((previous) => toastReducer(previous, { type: 'expire', now: Date.now() }));
    }, 160);

    return () => clearTimeout(timeoutId);
  }, [state.toasts]);

  return useMemo(
    () => ({
      toasts: state.toasts,
      enqueueToast,
      dismissToast
    }),
    [state.toasts, enqueueToast, dismissToast]
  );
}
