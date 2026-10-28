import { fetchWatchlist } from '../api';
import { changePercent, changeTone, money } from '../format';
import { useDashboard, useDashboardResource } from '../state/context';
import { Block } from './Block';

export function WatchlistBlock() {
  const { quotes, selectedSymbol, selectSymbol } = useDashboard();
  const watchlist = useDashboardResource(fetchWatchlist, 'user');
  const bySymbol = new Map(quotes.status === 'ready' ? quotes.data.map((q) => [q.symbol, q]) : []);
  return (
    <Block
      id="watchlist"
      title="Watchlist"
      state={watchlist}
      isEmpty={(list) => list.length === 0}
      emptyText="Your watchlist is empty."
    >
      {(list) => (
        <ul className="plain">
          {list.map((w) => {
            const quote = bySymbol.get(w.symbol);
            return (
              <li key={w.symbol} data-selected={w.symbol === selectedSymbol}>
                <button
                  type="button"
                  aria-pressed={w.symbol === selectedSymbol}
                  onClick={() => selectSymbol(w.symbol)}
                >
                  {w.symbol}
                </button>{' '}
                <span className="muted">{w.name}</span>{' '}
                {quote ? (
                  <span className={changeTone(quote.priceCents, quote.prevCloseCents)}>
                    {money(quote.priceCents)}{' '}
                    {changePercent(quote.priceCents, quote.prevCloseCents)}
                  </span>
                ) : (
                  <span className="muted">no price</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}
