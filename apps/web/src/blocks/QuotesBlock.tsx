import { changePercent, changeTone, money } from '../format';
import { useDashboard } from '../state/context';
import { Block } from './Block';

export function QuotesBlock() {
  const { quotes, selectedSymbol, selectSymbol } = useDashboard();
  return (
    <Block
      id="quotes"
      title="Quotes"
      state={quotes}
      isEmpty={(list) => list.length === 0}
      emptyText="No instruments are listed."
    >
      {(list) => (
        <table>
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Name</th>
              <th scope="col" className="num">
                Price
              </th>
              <th scope="col" className="num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((q) => (
              <tr key={q.symbol} data-selected={q.symbol === selectedSymbol}>
                <th scope="row">
                  <button
                    type="button"
                    aria-pressed={q.symbol === selectedSymbol}
                    onClick={() => selectSymbol(q.symbol)}
                  >
                    {q.symbol}
                  </button>
                </th>
                <td>{q.name}</td>
                <td className="num" data-testid={`price-${q.symbol}`}>
                  {money(q.priceCents)}
                </td>
                <td className={`num ${changeTone(q.priceCents, q.prevCloseCents)}`}>
                  {changePercent(q.priceCents, q.prevCloseCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Block>
  );
}
