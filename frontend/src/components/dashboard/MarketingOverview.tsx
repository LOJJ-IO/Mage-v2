'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboardApi';
import { lastSparkline } from '@/lib/dashboardTrend';
import { DashboardShell } from './DashboardShell';
import { KpiCard } from './KpiCard';
import { BlurFade } from './BlurFade';
import { VolumeAreaChart } from './charts/VolumeAreaChart';
import { SimpleBarChart } from './charts/SimpleBarChart';
import { DateRangeSelect } from './DateRangeSelect';
import { TrackingBanner } from './TrackingBanner';
import { PilotDataBadge } from './MetricTag';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function MarketingOverview() {
  const [days, setDays] = useState(30);

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', days],
    queryFn: () => dashboardApi.getSummary(days),
    refetchInterval: 60_000,
  });

  const seriesQuery = useQuery({
    queryKey: ['dashboard-timeseries', days],
    queryFn: () => dashboardApi.getTimeseries('messages', days),
    refetchInterval: 60_000,
  });

  const latencyQuery = useQuery({
    queryKey: ['dashboard-timeseries-latency', days],
    queryFn: () => dashboardApi.getTimeseries('latency', days),
    refetchInterval: 60_000,
  });

  const s = summaryQuery.data?.summary;
  const wins = summaryQuery.data?.recent_wins ?? [];
  const splits = summaryQuery.data?.chart_splits;

  const requestTypeChart = useMemo(() => {
    const mix = splits?.request_type_mix ?? [];
    return mix.map((item) => ({ name: item.name, value: item.value }));
  }, [splits]);

  const abilityChart = useMemo(() => {
    const mix = splits?.ability_mix ?? [];
    return mix.map((item) => ({ name: item.name, value: item.value }));
  }, [splits]);

  const teamReassignmentChart = useMemo(() => {
    const mix = splits?.team_reassignment_mix ?? [];
    return mix.map((item) => ({ name: item.name.replace(/_/g, ' '), value: item.value }));
  }, [splits]);

  const sparklines = useMemo(() => {
    const series = seriesQuery.data?.series ?? [];
    const handledPct = series.map((d) =>
      d.messages > 0 ? ((d.messages - d.escalations) / d.messages) * 100 : 0
    );
    const latency = (latencyQuery.data?.series ?? []).map((d) => d.value / 1000);
    const activity = series.map((d) => d.messages);
    return {
      handledPct: lastSparkline(handledPct),
      latency: lastSparkline(latency),
      activity: lastSparkline(activity),
      wow: lastSparkline(activity),
    };
  }, [seriesQuery.data, latencyQuery.data]);

  return (
    <DashboardShell
      title="Overview"
      subtitle="Pre-beta demo — headline metrics for client conversations"
      headerRight={
        <div className="flex items-center gap-2">
          <PilotDataBadge />
          <DateRangeSelect value={days} onChange={setDays} />
        </div>
      }
    >
      <TrackingBanner tracking={summaryQuery.data?.tracking} />

      <p className="mb-4 text-sm text-slate-500">
        {summaryQuery.data?.pilot_data_label ??
          'Pilot data — not live hotel operations. REAL tags are directly measured; PROXY tags are inferred.'}
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <BlurFade delay={0}>
          <KpiCard
            title="Handled without escalation (pilot data)"
            value={s?.resolved_without_escalation_pct ?? s?.handled_without_staff_pct ?? 0}
            suffix="%"
            subtitle={`${s?.resolved_without_escalation_count ?? 0} routing events without escalation`}
            trendLabel={`${s?.escalation_rate_pct ?? 0}% escalation rate`}
            measurementType="real"
            percentVisual={{
              mode: 'pie',
              breakdown: splits?.handled_vs_escalated,
            }}
            sparklineData={sparklines.handledPct}
            sparklineColor="#05944F"
          />
        </BlurFade>
        <BlurFade delay={80}>
          <KpiCard
            title="Request type coverage (pilot data)"
            value={s?.request_type_coverage_count ?? 0}
            subtitle={`${s?.ability_coverage_count ?? 0} distinct abilities triggered`}
            trendLabel={
              (s?.request_types_seen ?? []).slice(0, 4).join(', ') || 'No types yet'
            }
            measurementType="real"
            sparklineData={sparklines.activity}
            sparklineColor="#276EF1"
          />
        </BlurFade>
        <BlurFade delay={160}>
          <KpiCard
            title="Conversation completion rate (pilot data)"
            value={s?.conversation_completion_rate_pct ?? 0}
            suffix="%"
            subtitle={`${s?.sessions_completed ?? 0} completed · ${s?.sessions_abandoned ?? 0} abandoned`}
            trendLabel={`${s?.sessions_in_progress ?? 0} in progress`}
            measurementType="real"
            sparklineData={sparklines.handledPct}
            sparklineColor="#14B8A6"
          />
        </BlurFade>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <BlurFade delay={240}>
          <SimpleBarChart
            title="Request types exercised"
            description="Metric B — breadth of pilot scenarios (REAL)"
            data={requestTypeChart}
          />
        </BlurFade>
        <BlurFade delay={320}>
          <SimpleBarChart
            title="Abilities triggered"
            description="Metric B — ability coverage (REAL)"
            data={abilityChart}
          />
        </BlurFade>
        {(s?.manual_team_reassignments_count ?? 0) > 0 && (
          <BlurFade delay={360}>
            <SimpleBarChart
              title="Manual team picks"
              description="Front desk / manager reassigned tasks (REAL)"
              data={teamReassignmentChart}
            />
          </BlurFade>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-slate-500">Internal monitoring (secondary)</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="End-to-end route latency"
            value={(s?.avg_response_ms ?? 0) / 1000}
            decimals={2}
            suffix="s"
            subtitle={`p95 ${((s?.p95_response_ms ?? 0) / 1000).toFixed(2)}s`}
            measurementType="real"
            higherIsBetter={false}
            sparklineData={sparklines.latency}
            sparklineColor="#8B5CF6"
          />
          <KpiCard
            title="VADER satisfaction (internal)"
            value={s?.guest_satisfaction_pct ?? 0}
            suffix="%"
            subtitle={`${s?.happy_guests ?? 0} guests above threshold`}
            measurementType="proxy"
            notForClientReporting
            percentVisual={{
              mode: 'pie',
              breakdown: splits?.satisfaction_split,
            }}
          />
          <KpiCard
            title="Simulated labor $ (internal)"
            value={s?.labor_saved_usd ?? 0}
            prefix="$"
            subtitle="No real front desk in demo"
            measurementType="proxy"
            notForClientReporting
          />
          <KpiCard
            title="Pilot messages"
            value={s?.total_messages ?? 0}
            subtitle={`${s?.dau ?? 0} DAU · ${s?.wau ?? 0} WAU`}
            trendLabel={`${s?.wow_growth_pct ?? 0}% WoW`}
            measurementType="real"
            sparklineData={sparklines.wow}
            sparklineColor="#F59E0B"
          />
          <KpiCard
            title="Manual team picks (pilot data)"
            value={s?.manual_team_reassignments_count ?? 0}
            subtitle="Front desk / manager reassigned a task team"
            measurementType="real"
            higherIsBetter={false}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <BlurFade delay={400}>
            <VolumeAreaChart data={seriesQuery.data?.series ?? []} />
          </BlurFade>
        </div>
        <BlurFade delay={480}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Curation targets</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 space-y-1">
              <p>Flag transcripts in Event Log for advisor walk-throughs:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>2+ clean routine</li>
                <li>1 edge case handled gracefully</li>
                <li>1 graceful escalation</li>
                <li>1 successful multi-turn</li>
              </ul>
            </CardContent>
          </Card>
        </BlurFade>
      </div>

      <BlurFade delay={560} className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="font-heading text-lg font-semibold">Recent wins</h3>
            <p className="text-sm text-slate-500">Pair with flagged transcripts for client meetings</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Summary</TableHead>
                <TableHead>Ability</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Mood</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-slate-500">
                    No wins yet — enable tracking at demo start (see docs/demo_period_trigger.md).
                  </TableCell>
                </TableRow>
              ) : (
                wins.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-md truncate">{row.summary}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.ability}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.response_ms != null ? `${(row.response_ms / 1000).toFixed(2)}s` : '—'}
                    </TableCell>
                    <TableCell className="font-display font-normal">
                      {row.happiness_score != null ? `${row.happiness_score}/100` : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </BlurFade>
    </DashboardShell>
  );
}
