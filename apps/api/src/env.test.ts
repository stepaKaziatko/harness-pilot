import { describe, expect, it } from 'vitest';
import { parseEnv, readConfig } from './env.js';

describe('parseEnv', () => {
  it('reads pairs, skips comments and strips quotes', () => {
    expect(parseEnv('# c\nA=1\n\nB="two words"\nC=\'x\'\nbad line\n')).toEqual({
      A: '1',
      B: 'two words',
      C: 'x',
    });
  });
});

describe('readConfig', () => {
  it('has working defaults and honours overrides', () => {
    expect(readConfig({})).toEqual({
      databaseUrl: 'postgres://pilot:pilot@localhost:5432/pilot',
      port: 3001,
    });
    expect(readConfig({ DATABASE_URL: 'postgres://x', API_PORT: '4000' })).toEqual({
      databaseUrl: 'postgres://x',
      port: 4000,
    });
  });
});
