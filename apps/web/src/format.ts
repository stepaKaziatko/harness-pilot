/** Display only: amounts arrive from the API as whole cents and are never computed with here. */
export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** Change against the previous close, as a signed percentage with two decimals. */
export function changePercent(priceCents: number, prevCloseCents: number): string {
  if (prevCloseCents === 0) return '0.00%';
  const pct = ((priceCents - prevCloseCents) * 100) / prevCloseCents;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

export function changeTone(priceCents: number, prevCloseCents: number): 'up' | 'down' | 'flat' {
  if (priceCents > prevCloseCents) return 'up';
  return priceCents < prevCloseCents ? 'down' : 'flat';
}

/** "2026-10-28 12:00 UTC" from an ISO timestamp; fixed format, independent of the locale. */
export function timestamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
