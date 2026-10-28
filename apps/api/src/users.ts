export interface User {
  id: string;
  name: string;
}

export const USER_HEADER = 'x-pilot-user';
export const USER_COOKIE = 'pilot_user';

export type Resolution =
  { ok: true; user: User } | { ok: false; code: 'UNKNOWN_USER' | 'NO_USERS' };

/** Reads one cookie value out of a Cookie header; undefined when absent or empty. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return raw === '' ? undefined : decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/**
 * Dev-only current-user selection (not authentication): the X-Pilot-User header wins, then the
 * pilot_user cookie, then the first seeded user. An id that matches nobody is a request error.
 */
export function resolveCurrentUser(
  input: { header?: string | undefined; cookie?: string | undefined },
  users: readonly User[],
): Resolution {
  const requested = input.header?.trim() || readCookie(input.cookie, USER_COOKIE);
  if (requested !== undefined && requested !== '') {
    const found = users.find((u) => u.id === requested);
    return found ? { ok: true, user: found } : { ok: false, code: 'UNKNOWN_USER' };
  }
  const first = users[0];
  return first ? { ok: true, user: first } : { ok: false, code: 'NO_USERS' };
}
