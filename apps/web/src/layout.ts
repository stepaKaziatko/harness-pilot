/**
 * The fixed layout of the dashboard: which blocks exist, in which order they appear in the page,
 * and the name of the grid area each one occupies (the areas themselves are drawn in styles.css).
 * The order of this list is the order of the blocks in the DOM.
 */
export const DASHBOARD_LAYOUT = [
  { id: 'quotes', area: 'quotes' },
  { id: 'balance', area: 'balance' },
  { id: 'chart', area: 'chart' },
  { id: 'news', area: 'news' },
  { id: 'quick-actions', area: 'actions' },
  { id: 'watchlist', area: 'watchlist' },
  { id: 'operations', area: 'operations' },
] as const;

export type BlockId = (typeof DASHBOARD_LAYOUT)[number]['id'];
