'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboardApi';
import { DashboardShell } from './DashboardShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function TrackingSettingsView() {
  const qc = useQueryClient();
  const configQuery = useQuery({
    queryKey: ['dashboard-config'],
    queryFn: () => dashboardApi.getConfig(),
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => dashboardApi.patchConfig(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-config'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard-dev'] });
    },
  });

  const cfg = configQuery.data;

  return (
    <DashboardShell title="Settings" subtitle="Control metrics collection">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Tracking gates</CardTitle>
          <CardDescription>
            Events are recorded only when both the environment master switch and runtime toggle are on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
            <div>
              <p className="font-medium">Environment (METRICS_TRACKING_ENABLED)</p>
              <p className="text-sm text-slate-500">Master kill switch — requires redeploy to change</p>
            </div>
            <Badge variant={cfg?.env_enabled ? 'success' : 'destructive'}>
              {cfg?.env_enabled ? 'ON' : 'OFF'}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
            <div>
              <p className="font-medium">Runtime collection</p>
              <p className="text-sm text-slate-500">Pause or resume without redeploying</p>
            </div>
            <Badge variant={cfg?.db_enabled ? 'success' : 'secondary'}>
              {cfg?.db_enabled ? 'ON' : 'OFF'}
            </Badge>
          </div>
          <div className="flex gap-3">
            <Button
              disabled={!cfg?.env_enabled || mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Enable collection
            </Button>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(false)}
            >
              Pause collection
            </Button>
          </div>
          {!cfg?.env_enabled ? (
            <p className="text-sm text-amber-700">
              Set METRICS_TRACKING_ENABLED=true in backend .env to allow runtime collection.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
