import { describe, expect, it } from 'vitest';
import { readCookie, resolveCurrentUser, type User } from './users.js';

const users: User[] = [
  { id: 'u-a', name: 'A' },
  { id: 'u-b', name: 'B' },
];

describe('resolveCurrentUser', () => {
  it('prefers the header', () => {
    expect(resolveCurrentUser({ header: 'u-b', cookie: 'pilot_user=u-a' }, users)).toEqual({
      ok: true,
      user: users[1],
    });
  });

  it('falls back to the cookie', () => {
    expect(resolveCurrentUser({ cookie: 'x=1; pilot_user=u-b' }, users)).toEqual({
      ok: true,
      user: users[1],
    });
  });

  it('defaults to the first user', () => {
    expect(resolveCurrentUser({}, users)).toEqual({ ok: true, user: users[0] });
  });

  it('rejects an unknown id from the header or the cookie', () => {
    expect(resolveCurrentUser({ header: 'nobody' }, users)).toEqual({
      ok: false,
      code: 'UNKNOWN_USER',
    });
    expect(resolveCurrentUser({ cookie: 'pilot_user=nobody' }, users)).toEqual({
      ok: false,
      code: 'UNKNOWN_USER',
    });
  });

  it('reports NO_USERS when nothing is seeded', () => {
    expect(resolveCurrentUser({}, [])).toEqual({ ok: false, code: 'NO_USERS' });
  });
});

describe('readCookie', () => {
  it('ignores other cookies and empty values', () => {
    expect(readCookie('a=1; pilot_user=', 'pilot_user')).toBeUndefined();
    expect(readCookie(undefined, 'pilot_user')).toBeUndefined();
    expect(readCookie('a=1; pilot_user=u%2Db', 'pilot_user')).toBe('u-b');
  });
});
