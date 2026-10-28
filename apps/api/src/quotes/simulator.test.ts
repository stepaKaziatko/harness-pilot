import { describe, expect, it } from 'vitest';
import { historyAt, priceAt, priceAtTick, tickAt, TICK_MS } from './simulator.js';

describe('quote simulator', () => {
  it('returns the same price for the same seed, symbol and time', () => {
    const a = priceAt(7, 'AAA', 10_000, 1_700_000_123_456);
    const b = priceAt(7, 'AAA', 10_000, 1_700_000_123_999);
    expect(a).toEqual(b);
    expect(a.ts).toBe(tickAt(1_700_000_123_456) * TICK_MS);
  });

  it('depends on seed and symbol', () => {
    const base = priceAt(7, 'AAA', 10_000, 1_700_000_000_000).priceCents;
    const series = (seed: number, symbol: string) =>
      historyAt(seed, symbol, 10_000, 1_700_000_000_000, 50).map((p) => p.priceCents);
    expect(series(8, 'AAA')).not.toEqual(series(7, 'AAA'));
    expect(series(7, 'BBB')).not.toEqual(series(7, 'AAA'));
    expect(base).toBeGreaterThan(0);
  });

  it('keeps the price positive and bounded over 10 000 ticks', () => {
    for (const base of [1, 50, 12_345]) {
      for (let tick = 0; tick < 10_000; tick++) {
        const price = priceAtTick(3, 'AAA', base, tick);
        expect(price).toBeGreaterThan(0);
        expect(Number.isInteger(price)).toBe(true);
        expect(price).toBeLessThanOrEqual(Math.ceil(base * 1.13) + 1);
      }
    }
  });

  it('moves from one tick to the next', () => {
    const prices = new Set(
      Array.from({ length: 20 }, (_, i) => priceAtTick(3, 'AAA', 10_000, 1000 + i)),
    );
    expect(prices.size).toBeGreaterThan(5);
  });

  it('history is ordered, ends at the current tick and respects the limit', () => {
    const now = 1_700_000_000_500;
    const points = historyAt(3, 'AAA', 10_000, now, 120);
    expect(points).toHaveLength(120);
    expect(points.at(-1)).toEqual(priceAt(3, 'AAA', 10_000, now));
    for (let i = 1; i < points.length; i++) {
      expect((points[i] as { ts: number }).ts - (points[i - 1] as { ts: number }).ts).toBe(TICK_MS);
    }
    expect(historyAt(3, 'AAA', 10_000, now, 5)).toEqual(points.slice(-5));
  });
});
