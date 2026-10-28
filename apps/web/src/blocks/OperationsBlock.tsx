import { fetchOperations } from '../api';
import { money, timestamp } from '../format';
import { useDashboardResource } from '../state/context';
import { Block } from './Block';

export function OperationsBlock() {
  const operations = useDashboardResource(() => fetchOperations(10), 'orders');
  return (
    <Block
      id="operations"
      title="Recent operations"
      state={operations}
      isEmpty={(list) => list.length === 0}
      emptyText="No operations yet."
    >
      {(list) => (
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Side</th>
              <th scope="col">Symbol</th>
              <th scope="col" className="num">
                Units
              </th>
              <th scope="col" className="num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id}>
                <td>{timestamp(o.createdAt)}</td>
                <td>{o.side}</td>
                <th scope="row">{o.symbol}</th>
                <td className="num">{o.quantity}</td>
                <td className="num">{money(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Block>
  );
}
