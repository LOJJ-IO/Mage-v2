'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

const PIE_COLORS = ['#05944F', '#276EF1', '#94A3B8', '#F59E0B', '#E11900'];

export type PercentVisualMode = 'slider' | 'pie';

export function PercentMetricVisual({
  mode,
  value,
  breakdown = [],
  className,
}: {
  mode: PercentVisualMode;
  value: number;
  breakdown?: Array<{ name: string; value: number }>;
  className?: string;
}) {
  if (mode === 'slider') {
    const clamped = Math.min(100, Math.max(0, Math.abs(value)));
    return (
      <div className={cn('mt-3', className)}>
        <input
          type="range"
          min={0}
          max={100}
          value={clamped}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none h-1.5 w-full cursor-default appearance-none rounded-full bg-slate-100 accent-emerald-600 [&::-webkit-slider-thumb]:appearance-none"
        />
      </div>
    );
  }

  const slices = breakdown.filter((d) => d.value > 0);
  if (!slices.length) {
    return (
      <div
        className={cn(
          'mt-3 flex h-12 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400',
          className
        )}
      >
        Pie chart — awaiting split data
      </div>
    );
  }

  return (
    <div className={cn('mt-3 flex items-center gap-3', className)}>
      <div className="h-12 w-12 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={10}
              outerRadius={20}
              paddingAngle={2}
              strokeWidth={0}
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        {slices.slice(0, 3).map((item, i) => (
          <div key={item.name} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="truncate">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
