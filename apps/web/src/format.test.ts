import { describe, expect, it } from 'vitest';
import { changePercent, changeTone, money, timestamp } from './format';

describe('format', () => {
  it('formats whole cents as currency', () => {
    expect(money(123_456)).toBe('$1,234.56');
    expect(money(5, 'USD')).toBe('$0.05');
  });

  it('formats the change against the previous close with a sign', () => {
    expect(changePercent(10_100, 10_000)).toBe('+1.00%');
    expect(changePercent(9_950, 10_000)).toBe('-0.50%');
    expect(changePercent(10_000, 10_000)).toBe('+0.00%');
    expect(changePercent(1, 0)).toBe('0.00%');
    expect(changeTone(2, 1)).toBe('up');
    expect(changeTone(1, 2)).toBe('down');
    expect(changeTone(1, 1)).toBe('flat');
  });

  it('formats timestamps the same way in every locale and time zone', () => {
    expect(timestamp('2026-10-28T12:34:56.000Z')).toBe('2026-10-28 12:34 UTC');
  });
});
