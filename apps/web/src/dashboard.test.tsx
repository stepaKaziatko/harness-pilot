import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { mockApi } from './testing/mockApi';

beforeEach(() => {
  document.cookie = 'pilot_user=; Path=/; Max-Age=0';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const block = (id: string) => document.querySelector(`[data-block="${id}"]`) as HTMLElement;
const flush = () => act(async () => {});

async function open(overrides: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi(overrides);
  render(<App />);
  await flush();
  return api;
}

describe('the dashboard screen', () => {
  it('shows every block with data from the API', async () => {
    await open();
    expect(within(block('quotes')).getByText('Gamma Co')).toBeTruthy();
    expect(within(block('balance')).getByTestId('cash').textContent).toBe('$1,000.00');
    expect(within(block('chart')).getByTestId('chart-symbol').textContent).toBe('AAA');
    expect(within(block('news')).getByText('Headline number 2')).toBeTruthy();
    expect(within(block('quick-actions')).getByTestId('order-symbol').textContent).toBe('AAA');
    expect(within(block('watchlist')).getByText('Beta Co')).toBeTruthy();
    expect(within(block('operations')).getByText('No operations yet.')).toBeTruthy();
  });

  it('keeps working when one endpoint fails: the news block alerts, the rest render', async () => {
    await open({
      '/api/news': { status: 503, body: { code: 'DB_UNAVAILABLE', message: 'down' } },
    });
    expect(within(block('news')).getByRole('alert').textContent).toContain('DB_UNAVAILABLE');
    for (const id of ['quotes', 'balance', 'chart', 'quick-actions', 'watchlist', 'operations']) {
      expect(within(block(id)).queryByRole('alert'), id).toBeNull();
      expect(within(block(id)).queryByText('Loading...'), id).toBeNull();
    }
  });
});

describe('shared selection', () => {
  it('starts on the first instrument of the feed', async () => {
    await open();
    expect(
      within(block('quotes')).getByRole('button', { name: 'AAA' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('clicking a quote selects it in the chart, quick actions, quotes and watchlist', async () => {
    await open();
    await userEvent.click(within(block('quotes')).getByRole('button', { name: 'CCC' }));
    await flush();
    expect(within(block('chart')).getByTestId('chart-symbol').textContent).toBe('CCC');
    expect(within(block('quick-actions')).getByTestId('order-symbol').textContent).toBe('CCC');
    expect(
      within(block('quotes')).getByRole('button', { name: 'CCC' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      within(block('quotes')).getByRole('button', { name: 'AAA' }).getAttribute('aria-pressed'),
    ).toBe('false');
    // The watchlist highlights it too, because it is in that user's list.
    expect(
      within(block('watchlist')).getByRole('button', { name: 'CCC' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('clicking a watchlist entry does the same', async () => {
    const api = await open();
    await userEvent.click(within(block('watchlist')).getByRole('button', { name: 'BBB' }));
    await flush();
    expect(within(block('chart')).getByTestId('chart-symbol').textContent).toBe('BBB');
    expect(within(block('quick-actions')).getByTestId('order-symbol').textContent).toBe('BBB');
    expect(
      within(block('quotes')).getByRole('button', { name: 'BBB' }).getAttribute('aria-pressed'),
    ).toBe('true');
    const lastHistory = api.calls.filter((c) => c.path === '/api/history').at(-1);
    expect(lastHistory?.search).toContain('symbol=BBB');
  });
});

describe('orders', () => {
  it('posts JSON, then re-reads balance and operations without a reload', async () => {
    const api = await open();
    expect(api.count('/api/balance')).toBe(1);
    expect(api.count('/api/operations')).toBe(1);

    const form = block('quick-actions');
    fireEvent.change(within(form).getByLabelText(/Units/), { target: { value: '3' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Buy AAA' }));
    await flush();

    const post = api.calls.find((c) => c.path === '/api/orders');
    expect(post).toMatchObject({
      method: 'POST',
      body: { symbol: 'AAA', side: 'buy', quantity: 3 },
    });
    expect(within(form).getByRole('status').textContent).toMatch(/Filled: buy 3 AAA/);
    expect(api.count('/api/balance')).toBe(2);
    expect(api.count('/api/operations')).toBe(2);
    // Cash went down by the filled amount and the new operation is listed.
    expect(within(block('balance')).getByTestId('cash').textContent).toBe('$699.70');
    expect(within(block('operations')).getAllByRole('row')).toHaveLength(2);
    // Resources that do not depend on orders are not re-read.
    expect(api.count('/api/news')).toBe(1);
    expect(api.count('/api/watchlist')).toBe(1);
  });

  it('sells with the chosen side', async () => {
    const api = await open();
    const form = block('quick-actions');
    await userEvent.selectOptions(within(form).getByLabelText(/Side/), 'sell');
    await userEvent.click(within(form).getByRole('button', { name: 'Sell AAA' }));
    await flush();
    expect(api.calls.find((c) => c.path === '/api/orders')?.body).toMatchObject({ side: 'sell' });
  });

  it('shows the code of a rejected order and re-reads nothing', async () => {
    const api = await open({
      '/api/orders': {
        status: 409,
        body: { code: 'INSUFFICIENT_FUNDS', message: 'Not enough cash to fill this order' },
      },
    });
    await userEvent.click(within(block('quick-actions')).getByRole('button', { name: 'Buy AAA' }));
    await flush();
    expect(within(block('quick-actions')).getByRole('alert').textContent).toContain(
      'INSUFFICIENT_FUNDS',
    );
    expect(api.count('/api/balance')).toBe(1);
    expect(api.count('/api/operations')).toBe(1);
  });

  it('estimates the cost from the feed and refuses an invalid quantity', async () => {
    await open();
    const form = block('quick-actions');
    fireEvent.change(within(form).getByLabelText(/Units/), { target: { value: '5' } });
    expect(within(form).getByTestId('estimate').textContent).toBe('$500.50');
    for (const bad of ['0', '1.5', '10001', '']) {
      fireEvent.change(within(form).getByLabelText(/Units/), { target: { value: bad } });
      expect(within(form).getByRole('button', { name: 'Buy AAA' }).hasAttribute('disabled')).toBe(
        true,
      );
    }
  });
});

describe('switching the user', () => {
  it('re-reads every block and shows the other user', async () => {
    const api = await open();
    const before = {
      balance: api.count('/api/balance'),
      watchlist: api.count('/api/watchlist'),
      news: api.count('/api/news'),
      operations: api.count('/api/operations'),
      history: api.count('/api/history'),
      quotes: api.count('/api/quotes'),
    };
    expect(within(block('watchlist')).getByText('Beta Co')).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /switch user/i }), 'u-b');
    await flush();

    expect(api.count('/api/balance')).toBe(before.balance + 1);
    expect(api.count('/api/watchlist')).toBe(before.watchlist + 1);
    expect(api.count('/api/news')).toBe(before.news + 1);
    expect(api.count('/api/operations')).toBe(before.operations + 1);
    expect(api.count('/api/history')).toBe(before.history + 1);
    expect(api.count('/api/quotes')).toBe(before.quotes + 1);
    expect(within(block('balance')).getByTestId('cash').textContent).toBe('$50.00');
    expect(within(block('watchlist')).queryByText('Beta Co')).toBeNull();
    expect(within(block('watchlist')).getByText('Alpha Co')).toBeTruthy();
  });
});

describe('live quotes', () => {
  it('polls the feed once per interval for the whole screen and shows new prices', async () => {
    vi.useFakeTimers();
    const api = mockApi();
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.count('/api/quotes')).toBe(1);
    const first = within(block('quotes')).getByTestId('price-AAA').textContent;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(api.count('/api/quotes')).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.count('/api/quotes')).toBe(5);
    expect(within(block('quotes')).getByTestId('price-AAA').textContent).not.toBe(first);
    // The estimate in quick actions and the price in the watchlist follow the same feed.
    expect(within(block('quick-actions')).getByTestId('estimate').textContent).toBe(
      within(block('quotes')).getByTestId('price-AAA').textContent,
    );
  });

  it('keeps the last prices when a later poll fails', async () => {
    vi.useFakeTimers();
    let failing = false;
    const api = mockApi({
      '/api/quotes': () => {
        if (failing) return { status: 503, body: { code: 'DB_UNAVAILABLE', message: 'down' } };
        return {
          status: 200,
          body: [
            {
              symbol: 'AAA',
              name: 'Alpha Co',
              priceCents: 10_000,
              prevCloseCents: 10_000,
              updatedAt: 'x',
            },
          ],
        };
      },
    });
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    failing = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(api.count('/api/quotes')).toBe(3);
    expect(within(block('quotes')).queryByRole('alert')).toBeNull();
    expect(within(block('quotes')).getByTestId('price-AAA').textContent).toBe('$100.00');
  });

  it('refreshes the chart series every second too', async () => {
    vi.useFakeTimers();
    const api = mockApi();
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const before = api.count('/api/history');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(api.count('/api/history')).toBe(before + 2);
  });
});
