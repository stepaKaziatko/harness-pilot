import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { mockApi } from './testing/mockApi';

function stubHealth(health: { status: number; body: unknown }) {
  return mockApi({ '/api/health': health });
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
    const api = stubHealth({ status: 200, body: { status: 'ok', db: 'ok' } });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('health').textContent).toBe('API: ok (db: ok)'));
    expect(screen.getByTestId('me').textContent).toBe('Anna (u-a)');
    expect(api.fetchMock).toHaveBeenCalledWith('/api/health');
  });

  it('shows a degraded database instead of failing', async () => {
    stubHealth({
      status: 503,
      body: { status: 'degraded', db: 'unavailable', code: 'DB_UNAVAILABLE' },
    });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('health').textContent).toBe('API: degraded (db: unavailable)'),
    );
  });

  it('switching the user selects the cookie and re-reads the current user', async () => {
    stubHealth({ status: 200, body: { status: 'ok', db: 'ok' } });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('Anna (u-a)'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /switch user/i }), 'u-b');
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
    expect(await screen.findByText(/not reachable/)).toBeTruthy();
  });
});
