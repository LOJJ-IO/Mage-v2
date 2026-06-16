'use client';

import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

export function SparklinePreview({
  data,
  color = '#05944F',
  className,
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  const points = data.length
    ? data.map((value, index) => ({ index, value }))
    : [{ index: 0, value: 0 }, { index: 1, value: 0 }];

  const gradientId = `spark-${color.replace('#', '')}`;

  return (
    <div className={cn('h-14 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
