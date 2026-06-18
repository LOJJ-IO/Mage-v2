'use client';

import { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NumberTicker } from './NumberTicker';
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
  delay = 0,
}: {
  title: string;
  value: number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  delay?: number;
}) {
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp;

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-400"
        style={{ animationDelay: `${delay}ms` }}
      />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight text-slate-900">
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
      </CardContent>
    </Card>
  );
}
