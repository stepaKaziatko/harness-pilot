import { fetchHistory, type HistoryPoint } from '../api';
import { money, timestamp } from '../format';
import { useDashboard, useDashboardResource } from '../state/context';
import { Block } from './Block';

export const CHART_POINTS = 120;
const WIDTH = 400;
const HEIGHT = 160;
const PAD = 8;

function Line({ symbol, points }: { symbol: string; points: HistoryPoint[] }) {
  const prices = points.map((p) => p.priceCents);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = Math.max(hi - lo, 1);
  const x = (i: number) => PAD + (i * (WIDTH - 2 * PAD)) / Math.max(points.length - 1, 1);
  const y = (cents: number) => HEIGHT - PAD - ((cents - lo) * (HEIGHT - 2 * PAD)) / span;
  const path = points.map((p, i) => `${x(i).toFixed(1)},${y(p.priceCents).toFixed(1)}`).join(' ');
  const first = points[0] as HistoryPoint;
  const last = points[points.length - 1] as HistoryPoint;
  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Price of ${symbol}, ${points.length} points from ${money(lo)} to ${money(hi)}`}
        className="chart"
      >
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <p className="muted chart-legend">
        <span>
          {timestamp(first.ts)}: {money(first.priceCents)}
        </span>
        <span>
          low {money(lo)}, high {money(hi)}
        </span>
        <span>
          {timestamp(last.ts)}: <strong data-testid="chart-last">{money(last.priceCents)}</strong>
        </span>
      </p>
    </>
  );
}

export function ChartBlock() {
  const { selectedSymbol } = useDashboard();
  // The series is re-read every second, so the right edge follows the live feed.
  const history = useDashboardResource(
    () => fetchHistory(selectedSymbol ?? '', CHART_POINTS),
    'user',
    selectedSymbol,
    1000,
  );
  return (
    <Block
      id="chart"
      title="Chart"
      state={history}
      isEmpty={(h) => h.points.length === 0}
      emptyText="No price history."
    >
      {(h) => (
        <>
          <p className="chart-title">
            <strong data-testid="chart-symbol">{h.symbol}</strong>
          </p>
          <Line symbol={h.symbol} points={h.points} />
        </>
      )}
    </Block>
  );
}
