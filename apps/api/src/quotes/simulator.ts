/**
 * Simulated market data. A price is a pure function of (seed, symbol, base price, tick), where a
 * tick is one second of wall-clock time. Nothing is stored and nothing accumulates, so a restarted
 * API continues the same series and the chart history is available immediately.
 */

export const TICK_MS = 1000;
/** The price stays within +/-13% of the base price, so it is always positive and bounded. */
const SWING = { slow: 0.08, fast: 0.04, noise: 0.01 } as const;

export interface PricePoint {
  /** Start of the tick, epoch milliseconds. */
  ts: number;
  priceCents: number;
}

/** 32-bit integer hash (murmur3 finaliser) used instead of Math.random. */
function mix(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A deterministic number in [0, 1) for the given inputs. */
function unit(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) h = mix(h ^ mix(p));
  return h / 2 ** 32;
}

export function tickAt(nowMs: number): number {
  return Math.floor(nowMs / TICK_MS);
}

export function priceAtTick(seed: number, symbol: string, baseCents: number, tick: number): number {
  const s = hashString(symbol) ^ mix(seed);
  const phaseSlow = unit(s, 1) * 2 * Math.PI;
  const phaseFast = unit(s, 2) * 2 * Math.PI;
  const slow = Math.sin((tick / 420) * 2 * Math.PI + phaseSlow);
  const fast = Math.sin((tick / 37) * 2 * Math.PI + phaseFast);
  const noise = unit(s, 3, tick) * 2 - 1;
  const factor = 1 + SWING.slow * slow + SWING.fast * fast + SWING.noise * noise;
  return Math.max(1, Math.round(baseCents * factor));
}

export function priceAt(
  seed: number,
  symbol: string,
  baseCents: number,
  nowMs: number,
): PricePoint {
  const tick = tickAt(nowMs);
  return { ts: tick * TICK_MS, priceCents: priceAtTick(seed, symbol, baseCents, tick) };
}

/** The last `limit` ticks up to and including the current one, oldest first. */
export function historyAt(
  seed: number,
  symbol: string,
  baseCents: number,
  nowMs: number,
  limit: number,
): PricePoint[] {
  const last = tickAt(nowMs);
  const points: PricePoint[] = [];
  for (let tick = last - limit + 1; tick <= last; tick++) {
    points.push({ ts: tick * TICK_MS, priceCents: priceAtTick(seed, symbol, baseCents, tick) });
  }
  return points;
}
