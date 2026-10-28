import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { DASHBOARD_LAYOUT } from './layout';
import { DashboardProvider } from './state/DashboardProvider';
import { mockApi } from './testing/mockApi';

const EXPECTED = ['quotes', 'balance', 'chart', 'news', 'quick-actions', 'watchlist', 'operations'];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const blockIds = (root: ParentNode) =>
  [...root.querySelectorAll('[data-block]')].map((el) => el.getAttribute('data-block'));

/**
 * The reference layout: which blocks the screen has and in which order. It does not look at any
 * value, so it must keep passing unchanged for as long as the screen's default look is unchanged.
 */
describe('dashboard layout', () => {
  it('declares exactly the seven blocks in this order', () => {
    expect(DASHBOARD_LAYOUT.map((entry) => entry.id)).toEqual(EXPECTED);
  });

  it('renders the blocks in the order of DASHBOARD_LAYOUT, before any data has arrived', () => {
    mockApi();
    const { container } = render(
      <DashboardProvider epoch={0}>
        <Dashboard />
      </DashboardProvider>,
    );
    expect(blockIds(container)).toEqual(EXPECTED);
    expect(blockIds(container)).toEqual(DASHBOARD_LAYOUT.map((entry) => entry.id));
  });

  it('renders the same blocks in the same order once the data has arrived', async () => {
    mockApi();
    const { container } = render(
      <DashboardProvider epoch={0}>
        <Dashboard />
      </DashboardProvider>,
    );
    await act(async () => {});
    expect(blockIds(container)).toEqual(EXPECTED);
  });

  it('renders the same blocks in the same order when every endpoint fails', async () => {
    mockApi({
      '/api/quotes': { status: 503, body: { code: 'DB_UNAVAILABLE', message: 'down' } },
      '/api/balance': { status: 503, body: { code: 'DB_UNAVAILABLE', message: 'down' } },
      '/api/news': { status: 503, body: { code: 'DB_UNAVAILABLE', message: 'down' } },
    });
    const { container } = render(
      <DashboardProvider epoch={0}>
        <Dashboard />
      </DashboardProvider>,
    );
    await act(async () => {});
    expect(blockIds(container)).toEqual(EXPECTED);
  });

  it('gives every block a labelled section as its root', () => {
    mockApi();
    const { container } = render(
      <DashboardProvider epoch={0}>
        <Dashboard />
      </DashboardProvider>,
    );
    for (const el of container.querySelectorAll('[data-block]')) {
      expect(el.tagName).toBe('SECTION');
      expect(el.getAttribute('aria-label')).toBeTruthy();
    }
  });
});
