import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { fetchQuotes } from '../api';
import { DashboardContext, type DashboardState } from './context';
import { useResource } from './useResource';

export const QUOTE_POLL_MS = 1000;

export function DashboardProvider({ epoch, children }: { epoch: number; children: ReactNode }) {
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  // One poll for the whole screen: every block that shows a price reads this feed.
  const quotes = useResource(fetchQuotes, String(epoch), QUOTE_POLL_MS);
  const selectedSymbol =
    chosen ?? (quotes.status === 'ready' ? (quotes.data[0]?.symbol ?? null) : null);
  const orderPlaced = useCallback(() => setOrdersVersion((n) => n + 1), []);

  const value = useMemo<DashboardState>(
    () => ({ epoch, ordersVersion, quotes, selectedSymbol, selectSymbol: setChosen, orderPlaced }),
    [epoch, ordersVersion, quotes, selectedSymbol, orderPlaced],
  );
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
