import { act, cleanup, render, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardProvider } from '../state/DashboardProvider';
import { mockApi } from '../testing/mockApi';
import { BalanceBlock } from './BalanceBlock';
import { ChartBlock } from './ChartBlock';
import { NewsBlock } from './NewsBlock';
import { OperationsBlock } from './OperationsBlock';
import { QuickActionsBlock } from './QuickActionsBlock';
import { QuotesBlock } from './QuotesBlock';
import { WatchlistBlock } from './WatchlistBlock';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const down = {
  status: 503,
  body: { code: 'DB_UNAVAILABLE', message: 'The database is unavailable' },
};

const BLOCKS: {
  id: string;
  element: ReactNode;
  endpoint: string;
  empty?: unknown;
  sees: RegExp;
}[] = [
  { id: 'quotes', element: <QuotesBlock />, endpoint: '/api/quotes', empty: [], sees: /Alpha Co/ },
  { id: 'balance', element: <BalanceBlock />, endpoint: '/api/balance', sees: /Cash/ },
  {
    id: 'chart',
    element: <ChartBlock />,
    endpoint: '/api/history',
    empty: { symbol: 'AAA', points: [] },
    sees: /AAA/,
  },
  {
    id: 'news',
    element: <NewsBlock />,
    endpoint: '/api/news',
    empty: [],
    sees: /Headline number 1/,
  },
  {
    id: 'quick-actions',
    element: <QuickActionsBlock />,
    endpoint: '/api/quotes',
    sees: /Instrument/,
  },
  {
    id: 'watchlist',
    element: <WatchlistBlock />,
    endpoint: '/api/watchlist',
    empty: [],
    sees: /Beta Co/,
  },
  {
    id: 'operations',
    element: <OperationsBlock />,
    endpoint: '/api/operations',
    empty: [],
    sees: /No operations yet/,
  },
];

function mount(element: ReactNode) {
  return render(<DashboardProvider epoch={0}>{element}</DashboardProvider>);
}

const sectionOf = (id: string) => document.querySelector(`[data-block="${id}"]`) as HTMLElement;

describe.each(BLOCKS)('$id block', ({ id, element, endpoint, empty, sees }) => {
  it('is a labelled section that starts out loading', () => {
    mockApi();
    mount(element);
    const section = sectionOf(id);
    expect(section.tagName).toBe('SECTION');
    expect(section.getAttribute('aria-label')).toBeTruthy();
    expect(within(section).getByText('Loading...')).toBeTruthy();
  });

  it('shows data from the API', async () => {
    mockApi();
    mount(element);
    await act(async () => {});
    expect(within(sectionOf(id)).getByText(sees)).toBeTruthy();
  });

  it('shows the API error code in an alert and nothing else breaks', async () => {
    mockApi({ [endpoint]: down });
    mount(element);
    await act(async () => {});
    const alert = within(sectionOf(id)).getByRole('alert');
    expect(alert.textContent).toContain('DB_UNAVAILABLE');
  });

  it('shows NETWORK when the request cannot be made', async () => {
    mockApi({
      [endpoint]: () => {
        throw new TypeError('offline');
      },
    });
    mount(element);
    await act(async () => {});
    expect(within(sectionOf(id)).getByRole('alert').textContent).toContain('NETWORK');
  });

  if (empty !== undefined) {
    it('says so when there is nothing to show', async () => {
      mockApi({ [endpoint]: { status: 200, body: empty } });
      mount(element);
      await act(async () => {});
      const section = sectionOf(id);
      expect(within(section).queryByRole('alert')).toBeNull();
      expect(within(section).queryByText('Loading...')).toBeNull();
      expect(section.querySelector('table, ul, svg')).toBeNull();
    });
  }
});

describe('block contents', () => {
  it('quotes lists price and change against the previous close', async () => {
    mockApi();
    mount(<QuotesBlock />);
    await act(async () => {});
    const section = sectionOf('quotes');
    expect(within(section).getAllByRole('row')).toHaveLength(4);
    expect(within(section).getByTestId('price-AAA').textContent).toBe('$100.10');
    expect(within(section).getAllByText('+0.10%')).toHaveLength(1);
  });

  it('balance shows cash, positions and the total', async () => {
    mockApi();
    mount(<BalanceBlock />);
    await act(async () => {});
    const section = sectionOf('balance');
    expect(within(section).getByTestId('cash').textContent).toBe('$1,000.00');
    expect(within(section).getByTestId('total').textContent).toBe('$2,000.00');
    expect(within(section).getByText('AAA')).toBeTruthy();
  });

  it('news shows the headline, the source and a fixed-format date', async () => {
    mockApi();
    mount(<NewsBlock />);
    await act(async () => {});
    expect(within(sectionOf('news')).getAllByRole('listitem')).toHaveLength(3);
    expect(within(sectionOf('news')).getByText(/2026-10-20 08:30 UTC \(AAA\)/)).toBeTruthy();
  });

  it('chart draws an svg with a text alternative', async () => {
    mockApi();
    mount(<ChartBlock />);
    await act(async () => {});
    const img = within(sectionOf('chart')).getByRole('img');
    expect(img.tagName.toLowerCase()).toBe('svg');
    expect(img.getAttribute('aria-label')).toMatch(/Price of AAA/);
    expect(img.querySelectorAll('polyline')).toHaveLength(1);
  });
});
