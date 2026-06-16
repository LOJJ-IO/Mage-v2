'use client';

import type { TrackingConfig } from '@/lib/dashboardApi';
import { Badge } from '@/components/ui/badge';

export function TrackingBanner({ tracking }: { tracking?: TrackingConfig }) {
  if (!tracking) return null;
  if (tracking.active) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <Badge variant="success">Live</Badge>
        Collecting metrics from guest conversations.
      </div>
    );
  }
  return (
    <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Badge variant="secondary">Paused</Badge>
      Tracking is off — enable in Settings after setting METRICS_TRACKING_ENABLED=true.
    </div>
  );
}
