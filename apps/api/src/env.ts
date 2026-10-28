import { existsSync, readFileSync } from 'node:fs';

const ROOT_ENV = new URL('../../../.env', import.meta.url);

/** Parses KEY=VALUE lines; ignores blanks and comments; strips matching quotes. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      (value.startsWith('"') || value.startsWith("'")) &&
      value.endsWith(value[0] as string)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Loads the repository-root .env (if any) into process.env without overriding real variables. */
export function loadEnv(): void {
  if (!existsSync(ROOT_ENV)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(ROOT_ENV, 'utf8')))) {
    process.env[key] ??= value;
  }
}

export interface Config {
  databaseUrl: string;
  port: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://pilot:pilot@localhost:5432/pilot',
    port: Number(env.API_PORT ?? 3001),
  };
}
