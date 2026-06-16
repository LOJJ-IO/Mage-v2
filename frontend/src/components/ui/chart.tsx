'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
  }
>;

interface ChartContainerProps extends React.ComponentProps<'div'> {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, ...props }, ref) => {
    const uniqueId = React.useId();
    const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

    return (
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          'flex aspect-auto justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-slate-500 [&_.recharts-cartesian-grid_line]:stroke-slate-200/60',
          className
        )}
        style={
          {
            ...Object.entries(config).reduce(
              (acc, [key, item]) => {
                if (item.color) acc[`--color-${key}`] = item.color;
                return acc;
              },
              {} as Record<string, string>
            ),
          } as React.CSSProperties
        }
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    );
  }
);
ChartContainer.displayName = 'ChartContainer';

export { ChartContainer };
