'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboardApi';
import { DashboardShell } from './DashboardShell';
import { DateRangeSelect } from './DateRangeSelect';
import { TrackingBanner } from './TrackingBanner';
import { MetricTag } from './MetricTag';
import { SimpleBarChart } from './charts/SimpleBarChart';
import { BlurFade } from './BlurFade';

function toChartData(record: Record<string, number> | undefined) {
  if (!record) return [];
  return Object.entries(record).map(([name, value]) => ({ name, value }));
}

export function DevMetricsView() {
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ['dashboard-dev', days],
    queryFn: () => dashboardApi.getDev(days),
    refetchInterval: 60_000,
  });

  const m = query.data?.metrics as Record<string, unknown> | undefined;
  const confidence = (m?.confidence_buckets as Record<string, number>) || {};
  const abilityUsage = (m?.ability_usage as Record<string, number>) || {};
  const requestTypes = (m?.request_types as Record<string, number>) || {};
  const escalationReasons = (m?.escalation_reasons as Record<string, number>) || {};
  const latency = (m?.latency_avg_ms as Record<string, number>) || {};

  return (
    <DashboardShell
      title="Dev metrics"
      subtitle="Internal engineering health — not for client reporting"
      headerRight={<DateRangeSelect value={days} onChange={setDays} />}
    >
      <TrackingBanner tracking={query.data?.tracking} />

      <div className="mb-4 flex items-center gap-2">
        <MetricTag measurementType="proxy" notForClientReporting />
        <span className="text-xs text-slate-500">Dev health only</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DevMetricCard title="First-attempt resolution" value={`${(m?.first_attempt_resolution_pct as number) ?? 0}%`} measurementType="proxy" />
        <DevMetricCard title="Re-ask rate (proxy)" value={`${(m?.repetition_rate_pct as number) ?? 0}%`} measurementType="proxy" />
        <DevMetricCard title="FAQ rejection rate" value={`${(m?.faq_rejection_rate_pct as number) ?? 0}%`} measurementType="real" />
        <DevMetricCard title="Misclassification proxy" value={`${(m?.misclassification_proxy_pct as number) ?? 0}%`} measurementType="proxy" notForClientReporting />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <BlurFade>
          <SimpleBarChart
            title="Classifier confidence"
            description="NOT FOR CLIENT REPORTING"
            data={[
              { name: 'Low', value: confidence.low ?? 0 },
              { name: 'Medium', value: confidence.medium ?? 0 },
              { name: 'High', value: confidence.high ?? 0 },
            ]}
          />
        </BlurFade>
        <BlurFade delay={80}>
          <SimpleBarChart title="Ability usage" data={toChartData(abilityUsage)} />
        </BlurFade>
        <BlurFade delay={160}>
          <SimpleBarChart title="Request types" data={toChartData(requestTypes)} />
        </BlurFade>
        <BlurFade delay={240}>
          <SimpleBarChart title="Escalation reasons" data={toChartData(escalationReasons)} />
        </BlurFade>
      </div>

      <BlurFade delay={320} className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <h3 className="font-semibold">Latency & reliability</h3>
            <MetricTag measurementType="real" notForClientReporting />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Classifier avg" value={`${latency.classifier ?? 0} ms`} />
            <Stat label="Copy writer avg" value={`${latency.copy ?? 0} ms`} />
            <Stat label="Total avg" value={`${latency.total ?? 0} ms`} />
            <Stat label="p95/p50 consistency" value={`${(m?.response_consistency_ratio as number) ?? 0}x`} />
            <Stat label="Fallback rate" value={`${(m?.fallback_rate_pct as number) ?? 0}%`} />
            <Stat label="Prompt cache hit rate" value={`${(m?.prompt_cache_hit_rate_pct as number) ?? 0}%`} />
            <Stat label="Multi-turn guests" value={String((m?.multi_turn_guests as number) ?? 0)} />
            <Stat label="Routing events" value={String((m?.total_routing_events as number) ?? 0)} />
          </div>
        </div>
      </BlurFade>
    </DashboardShell>
  );
}

function DevMetricCard({
  title,
  value,
  measurementType,
  notForClientReporting,
}: {
  title: string;
  value: string;
  measurementType: 'real' | 'proxy';
  notForClientReporting?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-500">{title}</p>
        <MetricTag measurementType={measurementType} notForClientReporting={notForClientReporting} />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
