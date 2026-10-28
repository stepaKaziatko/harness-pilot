export interface User {
  id: string;
  name: string;
}

export interface Health {
  status: string;
  db: string;
  code?: string;
}

export const USER_COOKIE = 'pilot_user';

async function getJson<T>(path: string): Promise<T> {
  // Error responses (400, 503) carry a JSON body with a machine code, so parse regardless of status.
  const res = await fetch(path);
  return (await res.json()) as T;
}

export const fetchHealth = () => getJson<Health>('/api/health');
export const fetchUsers = () => getJson<User[]>('/api/users');
export const fetchMe = () => getJson<User | { code: string; message: string }>('/api/me');

/** Dev-only user selection: the API reads this cookie. It is not authentication. */
export function selectUser(id: string): void {
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(id)}; Path=/; SameSite=Lax`;
}
