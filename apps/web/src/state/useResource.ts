import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';

export type Resource<T> =
  { status: 'loading' } | { status: 'error'; code: string } | { status: 'ready'; data: T };

interface Slot<T> {
  key: string;
  data?: T;
  code?: string;
}

/**
 * Loads a value and, with `intervalMs`, keeps polling it. Changing `key` starts a fresh load
 * (the previous answer is not shown for the new key); a null key means "not ready, do not load".
 * A failed poll keeps the last good data; a failed first load is an error with the API's code.
 */
export function useResource<T>(
  load: () => Promise<T>,
  key: string | null,
  intervalMs?: number,
): Resource<T> {
  const [slot, setSlot] = useState<Slot<T> | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    let inFlight = false;
    const run = () => {
      if (inFlight) return;
      inFlight = true;
      loadRef
        .current()
        .then(
          (data) => {
            if (alive) setSlot({ key, data });
          },
          (err: unknown) => {
            const code = err instanceof ApiError ? err.code : 'NETWORK';
            if (alive) {
              setSlot((prev) =>
                prev?.key === key && prev.data !== undefined
                  ? { key, data: prev.data, code }
                  : { key, code },
              );
            }
          },
        )
        .finally(() => {
          inFlight = false;
        });
    };
    run();
    const timer = intervalMs ? setInterval(run, intervalMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [key, intervalMs]);

  if (key === null || slot?.key !== key) return { status: 'loading' };
  if (slot.data !== undefined) return { status: 'ready', data: slot.data };
  return { status: 'error', code: slot.code ?? 'NETWORK' };
}
