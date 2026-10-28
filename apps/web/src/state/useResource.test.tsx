import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { useResource } from './useResource';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useResource', () => {
  it('goes from loading to ready', async () => {
    const { result } = renderHook(() => useResource(async () => 42, 'k'));
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => {});
    expect(result.current).toEqual({ status: 'ready', data: 42 });
  });

  it('reports the machine code of a failed load, NETWORK for anything else', async () => {
    const coded = renderHook(() =>
      useResource(async () => Promise.reject(new ApiError('UNKNOWN_USER')), 'k'),
    );
    const other = renderHook(() =>
      useResource(async () => Promise.reject(new TypeError('offline')), 'k'),
    );
    await act(async () => {});
    expect(coded.result.current).toEqual({ status: 'error', code: 'UNKNOWN_USER' });
    expect(other.result.current).toEqual({ status: 'error', code: 'NETWORK' });
  });

  it('does not load while the key is null', async () => {
    const load = vi.fn(async () => 1);
    const { result } = renderHook(() => useResource(load, null));
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('loads again for a new key and never shows the old answer under it', async () => {
    const { result, rerender } = renderHook(({ key }) => useResource(async () => key, key), {
      initialProps: { key: 'a' },
    });
    await act(async () => {});
    expect(result.current).toEqual({ status: 'ready', data: 'a' });
    rerender({ key: 'b' });
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => {});
    expect(result.current).toEqual({ status: 'ready', data: 'b' });
  });

  it('ignores an answer that arrives after the key changed', async () => {
    let release: (v: string) => void = () => {};
    const slow = new Promise<string>((resolve) => (release = resolve));
    const { result, rerender } = renderHook(
      ({ key }) => useResource(() => (key === 'a' ? slow : Promise.resolve('b')), key),
      { initialProps: { key: 'a' } },
    );
    rerender({ key: 'b' });
    await act(async () => {});
    release('a');
    await act(async () => {});
    expect(result.current).toEqual({ status: 'ready', data: 'b' });
  });

  it('polls, skips a tick while a request is in flight, and stops on unmount', async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    let calls = 0;
    const load = () => {
      calls += 1;
      return calls === 2
        ? new Promise<number>((resolve) => (release = () => resolve(calls)))
        : Promise.resolve(calls);
    };
    const { unmount } = renderHook(() => useResource(load, 'k', 1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(calls).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(calls).toBe(2);
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(calls).toBe(3);
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(3);
  });
});
