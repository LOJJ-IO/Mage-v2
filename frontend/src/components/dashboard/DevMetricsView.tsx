'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboardApi';
import { DashboardShell } from './DashboardShell';
import { DateRangeSelect } from './DateRangeSelect';
import { TrackingBanner } from './TrackingBanner';
import { SimpleBarChart } from './charts/SimpleBarChart';
import { SimplePieChart } from './charts/SimplePieChart';
import { PhraseWordCloud } from './charts/PhraseWordCloud';
import { KpiCard } from './KpiCard';
import { BlurFade } from './BlurFade';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function toChartData(record: Record<string, number> | undefined): Array<{ name: string; value: number }> {
  if (!record) return [];
  return Object.entries(record).map(([k, v]) => ({ name: k, value: v }));
}

function lastSparkline(values: number[], length = 14): number[] {
  const slice = values.slice(-length);
  return slice.length ? slice : [0, 0];
}

export function DevMetricsView() {
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ['dashboard-dev', days],
    queryFn: () => dashboardApi.getDev(days),
    refetchInterval: 60_000,
  });

  const seriesQuery = useQuery({
    queryKey: ['dashboard-timeseries-dev', days],
    queryFn: () => dashboardApi.getTimeseries('messages', days),
    refetchInterval: 60_000,
  });

  const m = query.data?.metrics as Record<string, unknown> | undefined;
  const confidence = (m?.confidence_buckets as Record<string, number>) || {};
  const abilityUsage = (m?.ability_usage as Record<string, number>) || {};
  const requestTypes = (m?.request_types as Record<string, number>) || {};
  const escalationReasons = (m?.escalation_reasons as Record<string, number>) || {};
  const latency = (m?.latency_avg_ms as Record<string, number>) || {};
  const phrases = query.data?.phrase_cloud ?? [];

  const activitySpark = useMemo(
    () => lastSparkline((seriesQuery.data?.series ?? []).map((d) => d.messages)),
    [seriesQuery.data]
  );

  const abilityPie = toChartData(abilityUsage);

  return (
    <DashboardShell
      title="Dev metrics"
      subtitle="Engineering health — proxies labeled where ground truth is unavailable"
      headerRight={<DateRangeSelect value={days} onChange={setDays} />}
    >
      <TrackingBanner tracking={query.data?.tracking} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="First-attempt resolution"
          value={(m?.first_attempt_resolution_pct as number) ?? 0}
          suffix="%"
          sparklineData={activitySpark}
          sparklineColor="#05944F"
        />
        <KpiCard
          title="Re-ask rate (proxy)"
          value={(m?.repetition_rate_pct as number) ?? 0}
          suffix="%"
          sparklineData={activitySpark}
          sparklineColor="#E11900"
        />
        <KpiCard
          title="FAQ rejection rate"
          value={(m?.faq_rejection_rate_pct as number) ?? 0}
          suffix="%"
          sparklineData={activitySpark}
          sparklineColor="#F59E0B"
        />
        <KpiCard
          title="Misclassification proxy"
          value={(m?.misclassification_proxy_pct as number) ?? 0}
          suffix="%"
          sparklineData={activitySpark}
          sparklineColor="#8B5CF6"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <BlurFade>
          <SimpleBarChart
            title="Classifier confidence"
            description="Low / medium / high buckets"
            data={[
              { name: 'Low', value: confidence.low ?? 0 },
              { name: 'Medium', value: confidence.medium ?? 0 },
              { name: 'High', value: confidence.high ?? 0 },
            ]}
          />
        </BlurFade>
        <BlurFade delay={80}>
          <SimplePieChart title="Ability usage" description="Routing distribution" data={abilityPie} />
        </BlurFade>
        <BlurFade delay={160}>
          <SimpleBarChart
            title="Request types"
            description="repetition = re-asks, status_check = clarification proxy"
            data={toChartData(requestTypes)}
          />
        </BlurFade>
        <BlurFade delay={240}>
          <SimpleBarChart title="Escalation reasons" data={toChartData(escalationReasons)} />
        </BlurFade>
      </div>

      <BlurFade delay={280} className="mt-6">
        <PhraseWordCloud
          phrases={phrases}
          title="Repeated guest phrases"
          description="Engineering view of common questions and friction signals"
        />
      </BlurFade>

      <BlurFade delay={320} className="mt-6">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="font-heading">Latency & reliability</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-slate-500">Classifier avg</p>
              <p className="font-display text-2xl font-semibold">{latency.classifier ?? 0} ms</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Copy writer avg</p>
              <p className="font-display text-2xl font-semibold">{latency.copy ?? 0} ms</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total avg</p>
              <p className="font-display text-2xl font-semibold">{latency.total ?? 0} ms</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">p95/p50 consistency</p>
              <p className="font-display text-2xl font-semibold">
                {(m?.response_consistency_ratio as number) ?? 0}x
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Fallback rate</p>
              <p className="font-display text-2xl font-semibold">{(m?.fallback_rate_pct as number) ?? 0}%</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Prompt cache hit rate</p>
              <p className="font-display text-2xl font-semibold">
                {(m?.prompt_cache_hit_rate_pct as number) ?? 0}%
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Multi-turn guests</p>
              <p className="font-display text-2xl font-semibold">{(m?.multi_turn_guests as number) ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Routing events</p>
              <p className="font-display text-2xl font-semibold">{(m?.total_routing_events as number) ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </BlurFade>
    </DashboardShell>
  );
}
