import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * A string kept in localStorage: null on the server and before hydration, then the stored
 * value; setting it updates every component reading the same key.
 */
export function useStoredValue(key: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key),
    () => null
  );
  const setValue = useCallback(
    (next: string) => {
      window.localStorage.setItem(key, next);
      for (const listener of listeners) listener();
    },
    [key]
  );
  return [value, setValue] as const;
}
