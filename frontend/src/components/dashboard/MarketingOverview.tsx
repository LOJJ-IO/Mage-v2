'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboardApi';
import { DashboardShell } from './DashboardShell';
import { KpiCard } from './KpiCard';
import { BlurFade } from './BlurFade';
import { VolumeAreaChart } from './charts/VolumeAreaChart';
import { DateRangeSelect } from './DateRangeSelect';
import { TrackingBanner } from './TrackingBanner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

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

  const s = summaryQuery.data?.summary;
  const wins = summaryQuery.data?.recent_wins ?? [];

  return (
    <DashboardShell
      title="Overview"
      subtitle="Marketing metrics — lead with ROI and guest satisfaction"
      headerRight={<DateRangeSelect value={days} onChange={setDays} />}
    >
      <TrackingBanner tracking={summaryQuery.data?.tracking} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BlurFade delay={0}>
          <KpiCard
            title="Calls avoided"
            value={s?.calls_avoided ?? 0}
            subtitle={`~${Math.round((s?.time_saved_minutes ?? 0) / 60)} labor hours saved`}
            trend="up"
            trendLabel={`$${(s?.labor_saved_usd ?? 0).toLocaleString()} saved`}
          />
        </BlurFade>
        <BlurFade delay={80}>
          <KpiCard
            title="Guest satisfaction"
            value={s?.guest_satisfaction_pct ?? 0}
            suffix="%"
            subtitle={`${s?.happy_guests ?? 0} happy guests scored`}
            trend="up"
            trendLabel="Positive sentiment"
          />
        </BlurFade>
        <BlurFade delay={160}>
          <KpiCard
            title="Avg response time"
            value={(s?.avg_response_ms ?? 0) / 1000}
            decimals={2}
            suffix="s"
            subtitle={`p95 ${((s?.p95_response_ms ?? 0) / 1000).toFixed(2)}s`}
            trend="up"
            trendLabel="Instant answers"
          />
        </BlurFade>
        <BlurFade delay={240}>
          <KpiCard
            title="Handled without staff"
            value={s?.handled_without_staff_pct ?? 0}
            suffix="%"
            subtitle={`${s?.escalation_rate_pct ?? 0}% escalation rate`}
            trend="up"
            trendLabel={`${s?.total_messages ?? 0} total messages`}
          />
        </BlurFade>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <BlurFade delay={320}>
            <VolumeAreaChart data={seriesQuery.data?.series ?? []} />
          </BlurFade>
        </div>
        <BlurFade delay={400}>
          <div className="grid gap-4">
            <KpiCard title="Daily active guests" value={s?.dau ?? 0} subtitle={`${s?.wau ?? 0} weekly active`} />
            <KpiCard
              title="Week-over-week growth"
              value={s?.wow_growth_pct ?? 0}
              suffix="%"
              trend={(s?.wow_growth_pct ?? 0) >= 0 ? 'up' : 'down'}
              trendLabel="Message volume momentum"
            />
          </div>
        </BlurFade>
      </div>

      <BlurFade delay={480} className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="text-lg font-semibold">Recent wins</h3>
            <p className="text-sm text-slate-500">Guest-friendly outcomes — no staff required</p>
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
                    No wins yet — enable tracking and run test conversations.
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
                    <TableCell>
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
