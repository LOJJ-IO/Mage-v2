'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NumberTicker } from './NumberTicker';
import { SparklinePreview } from './charts/SparklinePreview';
import { cn } from '@/lib/utils';

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
}: {
  title: string;
  value: number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  sparklineData?: number[];
  sparklineColor?: string;
}) {
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp;

  return (
    <Card className="overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="font-display text-3xl font-semibold tracking-tight text-slate-900">
          {prefix}
          <NumberTicker value={value} decimals={decimals} suffix={suffix} />
        </div>
        {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        {trendLabel ? (
          <Badge
            variant={trend === 'down' ? 'destructive' : 'success'}
            className={cn('mt-3 gap-1', trend === 'neutral' && 'bg-slate-100 text-slate-600')}
          >
            {trend !== 'neutral' && trend ? <TrendIcon className="h-3 w-3" /> : null}
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
