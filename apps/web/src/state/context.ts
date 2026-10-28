import { createContext, useContext } from 'react';
import type { Quote } from '../api';
import { useResource, type Resource } from './useResource';

/**
 * State shared by the blocks of the screen. It is deliberately a single place: which instrument
 * is selected, the one live quote feed, and what must be re-read after an order or a user switch.
 */
export interface DashboardState {
  /** Bumped when the current user changes; every resource is re-read. */
  epoch: number;
  /** Bumped after an accepted order; balance and operations are re-read. */
  ordersVersion: number;
  quotes: Resource<Quote[]>;
  selectedSymbol: string | null;
  selectSymbol: (symbol: string) => void;
  orderPlaced: () => void;
}

export const DashboardContext = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const state = useContext(DashboardContext);
  if (!state) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return state;
}

/**
 * A resource that belongs to the current user. `rereadAfter` picks what refreshes it:
 * 'user' only a user switch; 'orders' also an accepted order. A null `extraKey` holds the load.
 */
export function useDashboardResource<T>(
  load: () => Promise<T>,
  rereadAfter: 'user' | 'orders',
  extraKey: string | null = '',
  intervalMs?: number,
): Resource<T> {
  const { epoch, ordersVersion } = useDashboard();
  const key =
    extraKey === null
      ? null
      : `${epoch}:${rereadAfter === 'orders' ? ordersVersion : 0}:${extraKey}`;
  return useResource(load, key, intervalMs);
}
