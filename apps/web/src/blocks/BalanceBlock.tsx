import { fetchBalance } from '../api';
import { money } from '../format';
import { useDashboardResource } from '../state/context';
import { Block } from './Block';

export function BalanceBlock() {
  const balance = useDashboardResource(fetchBalance, 'orders');
  return (
    <Block id="balance" title="Balance" state={balance}>
      {(b) => (
        <>
          <dl className="summary">
            <div>
              <dt>Cash</dt>
              <dd data-testid="cash">{money(b.cashCents, b.currency)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd data-testid="total">{money(b.totalCents, b.currency)}</dd>
            </div>
          </dl>
          {b.positions.length === 0 ? (
            <p className="muted">No open positions.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col" className="num">
                    Units
                  </th>
                  <th scope="col" className="num">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.positions.map((p) => (
                  <tr key={p.symbol}>
                    <th scope="row">{p.symbol}</th>
                    <td className="num">{p.quantity}</td>
                    <td className="num">{money(p.valueCents, b.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Block>
  );
}
