import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const users = [
  { id: 'u-a', name: 'Anna' },
  { id: 'u-b', name: 'Boris' },
];

function mockApi(health: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (path: string) => {
    const current = document.cookie.includes('pilot_user=u-b') ? users[1] : users[0];
    const table: Record<string, { status: number; body: unknown }> = {
      '/api/health': health,
      '/api/users': { status: 200, body: users },
      '/api/me': { status: 200, body: current },
    };
    const hit = table[path] ?? { status: 404, body: { code: 'NOT_FOUND' } };
    return { ok: hit.status < 400, status: hit.status, json: async () => hit.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  document.cookie = 'pilot_user=; Path=/; Max-Age=0';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows the health response and the current user', async () => {
    const fetchMock = mockApi({ status: 200, body: { status: 'ok', db: 'ok' } });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('health').textContent).toBe('ok (db: ok)'));
    expect(screen.getByTestId('me').textContent).toBe('Anna (u-a)');
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
  });

  it('shows a degraded database instead of failing', async () => {
    mockApi({
      status: 503,
      body: { status: 'degraded', db: 'unavailable', code: 'DB_UNAVAILABLE' },
    });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('health').textContent).toBe('degraded (db: unavailable)'),
    );
  });

  it('switching the user selects the cookie and re-reads the current user', async () => {
    mockApi({ status: 200, body: { status: 'ok', db: 'ok' } });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('Anna (u-a)'));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'u-b');
    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('Boris (u-b)'));
    expect(document.cookie).toContain('pilot_user=u-b');
  });

  it('reports an unreachable API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network');
      }),
    );
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('not reachable');
  });
});
