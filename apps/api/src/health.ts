export type HealthResult =
  | { status: 200; body: { status: 'ok'; db: 'ok' } }
  | { status: 503; body: { status: 'degraded'; db: 'unavailable'; code: 'DB_UNAVAILABLE' } };

export const DEFAULT_DB_TIMEOUT_MS = 1500;

/** Runs the injected database check with a deadline; any failure or timeout means "degraded". */
export async function getHealth(
  checkDb: () => Promise<void>,
  timeoutMs: number = DEFAULT_DB_TIMEOUT_MS,
): Promise<HealthResult> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('database check timed out')), timeoutMs);
  });
  try {
    await Promise.race([checkDb(), deadline]);
    return { status: 200, body: { status: 'ok', db: 'ok' } };
  } catch {
    return {
      status: 503,
      body: { status: 'degraded', db: 'unavailable', code: 'DB_UNAVAILABLE' },
    };
  } finally {
    clearTimeout(timer);
  }
}
