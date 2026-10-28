import { useEffect, useState } from 'react';
import { Dashboard } from './Dashboard';
import { DashboardProvider } from './state/DashboardProvider';
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
      <header className="topbar">
        <h1>Harness pilot</h1>
        <p data-testid="health" className="muted">
          API: {health ? `${health.status} (db: ${health.db})` : 'loading...'}
        </p>
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
      </header>
      {failed && <p role="alert">The API is not reachable.</p>}
      <DashboardProvider epoch={reloads}>
        <Dashboard />
      </DashboardProvider>
    </main>
  );
}
