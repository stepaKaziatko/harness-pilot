import type { ReactNode } from 'react';
import type { Resource } from '../state/useResource';

interface BlockProps<T> {
  id: string;
  title: string;
  state: Resource<T>;
  /** Decides whether loaded data counts as "nothing to show". */
  isEmpty?: (data: T) => boolean;
  emptyText?: string;
  children: (data: T) => ReactNode;
}

/**
 * The frame every block shares: a labelled section carrying its id, and the four states of a
 * block (loading, error with the API's code, empty, data). A failing block never affects another.
 */
export function Block<T>({
  id,
  title,
  state,
  isEmpty,
  emptyText = 'Nothing to show yet.',
  children,
}: BlockProps<T>) {
  let body: ReactNode;
  if (state.status === 'loading') body = <p className="muted">Loading...</p>;
  else if (state.status === 'error') {
    body = (
      <p role="alert" className="error">
        Could not load {title.toLowerCase()}: <code>{state.code}</code>
      </p>
    );
  } else if (isEmpty?.(state.data)) body = <p className="muted">{emptyText}</p>;
  else body = children(state.data);

  return (
    <section data-block={id} aria-label={title} className="block">
      <h2>{title}</h2>
      {body}
    </section>
  );
}
