import { useState, type FormEvent } from 'react';
import { ApiError, placeOrder, type Side } from '../api';
import { money } from '../format';
import { useDashboard } from '../state/context';
import { Block } from './Block';

const MAX_QUANTITY = 10_000;

type Outcome = { kind: 'filled'; text: string } | { kind: 'rejected'; code: string };

export function QuickActionsBlock() {
  const { quotes, selectedSymbol, orderPlaced } = useDashboard();
  const [side, setSide] = useState<Side>('buy');
  const [quantity, setQuantity] = useState('1');
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const units = Number(quantity);
  const validUnits = Number.isInteger(units) && units >= 1 && units <= MAX_QUANTITY;

  async function submit(event: FormEvent, symbol: string) {
    event.preventDefault();
    setSending(true);
    try {
      const op = await placeOrder({ symbol, side, quantity: units });
      setOutcome({
        kind: 'filled',
        text: `Filled: ${op.side} ${op.quantity} ${op.symbol} at ${money(op.priceCents)}, total ${money(op.totalCents)}.`,
      });
      orderPlaced();
    } catch (err) {
      setOutcome({ kind: 'rejected', code: err instanceof ApiError ? err.code : 'NETWORK' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Block id="quick-actions" title="Quick actions" state={quotes}>
      {(list) => {
        const quote = list.find((q) => q.symbol === selectedSymbol);
        if (!quote) return <p className="muted">Select an instrument.</p>;
        const estimate = validUnits ? money(units * quote.priceCents) : 'n/a';
        return (
          <form onSubmit={(e) => submit(e, quote.symbol)}>
            <p>
              Instrument: <strong data-testid="order-symbol">{quote.symbol}</strong>{' '}
              <span className="muted">{quote.name}</span>
            </p>
            <label>
              Side{' '}
              <select value={side} onChange={(e) => setSide(e.target.value as Side)}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>{' '}
            <label>
              Units{' '}
              <input
                type="number"
                min={1}
                max={MAX_QUANTITY}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <p className="muted">
              Estimated cost at the current price: <span data-testid="estimate">{estimate}</span>.
              The server fills at its own price.
            </p>
            <button type="submit" disabled={sending || !validUnits}>
              {side === 'buy' ? 'Buy' : 'Sell'} {quote.symbol}
            </button>
            {outcome?.kind === 'filled' && <p role="status">{outcome.text}</p>}
            {outcome?.kind === 'rejected' && (
              <p role="alert" className="error">
                Order rejected: <code>{outcome.code}</code>
              </p>
            )}
          </form>
        );
      }}
    </Block>
  );
}
