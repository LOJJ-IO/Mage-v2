'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NumberTicker } from './NumberTicker';
import { SparklinePreview } from './charts/SparklinePreview';
import {
  PercentMetricVisual,
  type PercentVisualMode,
} from './PercentMetricVisual';
import {
  inferTrendFromSeries,
  trendBadgeVariant,
  type TrendDirection,
} from '@/lib/dashboardTrend';
import { cn } from '@/lib/utils';
import { MetricTag, type MeasurementType } from './MetricTag';

export function KpiCard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  decimals = 0,
  suffix = '',
  prefix = '',
  sparklineData,
  sparklineColor = '#05944F',
  higherIsBetter = true,
  percentVisual,
  measurementType,
  notForClientReporting,
}: {
  title: string;
  value: number;
  subtitle?: string;
  trend?: TrendDirection;
  trendLabel?: string;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  sparklineData?: number[];
  sparklineColor?: string;
  /** When false, an upward sparkline trend is treated as negative (e.g. latency). */
  higherIsBetter?: boolean;
  /** Optional slider or mini pie for percentage metrics — sparkline still shows trend. */
  percentVisual?: {
    mode: PercentVisualMode;
    breakdown?: Array<{ name: string; value: number }>;
  };
  measurementType?: MeasurementType;
  notForClientReporting?: boolean;
}) {
  const resolvedTrend =
    trend ??
    (sparklineData?.length ? inferTrendFromSeries(sparklineData, { higherIsBetter }) : 'neutral');

  const TrendIcon = resolvedTrend === 'down' ? TrendingDown : TrendingUp;
  const badgeVariant = trendBadgeVariant(resolvedTrend, higherIsBetter);
  const isPercent = suffix === '%';

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
          {measurementType ? (
            <MetricTag
              measurementType={measurementType}
              notForClientReporting={notForClientReporting}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="font-display text-3xl font-normal tracking-tight text-slate-900">
          {prefix}
          <NumberTicker value={value} decimals={decimals} suffix={suffix} />
        </div>

        {isPercent && percentVisual ? (
          <PercentMetricVisual
            mode={percentVisual.mode}
            value={value}
            breakdown={percentVisual.breakdown}
          />
        ) : null}

        {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}

        {trendLabel ? (
          <Badge variant={badgeVariant} className={cn('mt-3 gap-1')}>
            {resolvedTrend !== 'neutral' ? <TrendIcon className="h-3 w-3" /> : null}
            {trendLabel}
          </Badge>
        ) : null}

        {sparklineData && sparklineData.length > 0 ? (
          <div className="-mx-2 mt-4 border-t border-slate-100 pt-2">
            <SparklinePreview data={sparklineData} color={sparklineColor} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
