/** Spreads modules evenly over the timeline, starting on `start` (YYYY-MM-DD). */
export function scheduleDates(start: string, weeks: number, count: number): string[] {
  const days = Math.max(1, weeks * 7);
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(t0 + Math.floor((i * days) / count) * 86_400_000).toISOString().slice(0, 10));
}
