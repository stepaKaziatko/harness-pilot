import { fetchNews } from '../api';
import { timestamp } from '../format';
import { useDashboardResource } from '../state/context';
import { Block } from './Block';

export function NewsBlock() {
  const news = useDashboardResource(fetchNews, 'user');
  return (
    <Block
      id="news"
      title="News"
      state={news}
      isEmpty={(items) => items.length === 0}
      emptyText="No news."
    >
      {(items) => (
        <ul className="plain">
          {items.map((n) => (
            <li key={n.id}>
              <span className="headline">{n.title}</span>
              <span className="muted">
                {' '}
                {n.source}, {timestamp(n.publishedAt)}
                {n.symbol ? ` (${n.symbol})` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}
