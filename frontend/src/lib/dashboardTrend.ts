export type TrendDirection = 'up' | 'down' | 'neutral';

export function lastSparkline(values: number[], length = 14): number[] {
  const slice = values.slice(-length);
  return slice.length ? slice : [0, 0];
}

/** Compare recent vs earlier window in a sparkline series. */
export function inferTrendFromSeries(
  values: number[],
  options?: { higherIsBetter?: boolean; epsilon?: number }
): TrendDirection {
  const { higherIsBetter = true, epsilon = 0.02 } = options ?? {};
  if (!values.length || values.length < 2) return 'neutral';

  const window = Math.min(3, Math.floor(values.length / 2));
  const early = values.slice(0, window);
  const recent = values.slice(-window);
  const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;

  if (earlyAvg === 0 && recentAvg === 0) return 'neutral';

  const base = Math.max(Math.abs(earlyAvg), 1);
  const delta = (recentAvg - earlyAvg) / base;

  if (Math.abs(delta) < epsilon) return 'neutral';
  if (delta > 0) return higherIsBetter ? 'up' : 'down';
  return higherIsBetter ? 'down' : 'up';
}

export function trendBadgeVariant(
  trend: TrendDirection,
  higherIsBetter = true
): 'success' | 'destructive' | 'neutral' {
  if (trend === 'neutral') return 'neutral';
  const positive = trend === 'up' ? higherIsBetter : !higherIsBetter;
  return positive ? 'success' : 'destructive';
}
