import { useEffect, useState } from 'react';
import { fetchHealth, fetchMe, fetchUsers, selectUser, type Health, type User } from './api';

type Me = Awaited<ReturnType<typeof fetchMe>>;

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  // Bumping this re-reads everything; the fetches run inside the effect so state is only set
  // after they resolve.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchHealth(), fetchUsers(), fetchMe()]).then(
      ([h, u, m]) => {
        if (cancelled) return;
        setHealth(h);
        // /api/users answers with an error object (not a list) while the database is down.
        setUsers(Array.isArray(u) ? u : []);
        setMe(m);
        setFailed(false);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const currentId = me && 'id' in me ? me.id : '';

  return (
    <main>
      <h1>Harness pilot</h1>
      {failed && <p role="alert">The API is not reachable.</p>}
      <section aria-label="Health">
        <h2>API health</h2>
        <p data-testid="health">{health ? `${health.status} (db: ${health.db})` : 'loading...'}</p>
      </section>
      <section aria-label="Current user">
        <h2>Current user</h2>
        <p data-testid="me">
          {me ? ('id' in me ? `${me.name} (${me.id})` : `error: ${me.code}`) : 'loading...'}
        </p>
        <label>
          Switch user (dev only, not authentication){' '}
          <select
            value={currentId}
            disabled={users.length === 0}
            onChange={(e) => {
              selectUser(e.target.value);
              setReloads((n) => n + 1);
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </section>
    </main>
  );
}
