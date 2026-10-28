import type { ComponentType } from 'react';
import { BalanceBlock } from './blocks/BalanceBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { NewsBlock } from './blocks/NewsBlock';
import { OperationsBlock } from './blocks/OperationsBlock';
import { QuickActionsBlock } from './blocks/QuickActionsBlock';
import { QuotesBlock } from './blocks/QuotesBlock';
import { WatchlistBlock } from './blocks/WatchlistBlock';
import { DASHBOARD_LAYOUT, type BlockId } from './layout';

const BLOCKS: Record<BlockId, ComponentType> = {
  quotes: QuotesBlock,
  balance: BalanceBlock,
  chart: ChartBlock,
  news: NewsBlock,
  'quick-actions': QuickActionsBlock,
  watchlist: WatchlistBlock,
  operations: OperationsBlock,
};

/** Renders the blocks in the order of DASHBOARD_LAYOUT, each in its grid area. */
export function Dashboard() {
  return (
    <div className="dashboard">
      {DASHBOARD_LAYOUT.map(({ id, area }) => {
        const Block = BLOCKS[id];
        return (
          <div key={id} className="cell" data-area={area}>
            <Block />
          </div>
        );
      })}
    </div>
  );
}
