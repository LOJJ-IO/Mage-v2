'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type MeasurementType = 'real' | 'proxy';

export function MetricTag({
  measurementType,
  notForClientReporting,
  className,
}: {
  measurementType: MeasurementType;
  notForClientReporting?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <Badge
        variant={measurementType === 'real' ? 'default' : 'secondary'}
        className="text-[10px] font-normal uppercase tracking-wide"
      >
        {measurementType}
      </Badge>
      {notForClientReporting ? (
        <Badge variant="outline" className="text-[10px] font-normal text-amber-800 border-amber-300">
          Not for client reporting
        </Badge>
      ) : null}
    </span>
  );
}

export function PilotDataBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('text-xs font-normal text-slate-600', className)}>
      Pilot data
    </Badge>
  );
}
