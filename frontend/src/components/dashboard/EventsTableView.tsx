'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboardApi';
import { DashboardShell } from './DashboardShell';
import { DateRangeSelect } from './DateRangeSelect';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export function EventsTableView() {
  const [days, setDays] = useState(7);
  const [eventType, setEventType] = useState('');

  const query = useQuery({
    queryKey: ['dashboard-events', days, eventType],
    queryFn: () => dashboardApi.getEvents(days, eventType || undefined, 200),
    refetchInterval: 60_000,
  });

  return (
    <DashboardShell
      title="Event log"
      subtitle="Raw metrics events for auditing"
      headerRight={<DateRangeSelect value={days} onChange={setDays} />}
    >
      <div className="mb-4 max-w-xs">
        <Input
          placeholder="Filter event_type (routing, faq_feedback...)"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Ability</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data?.events ?? []).map((ev, i) => (
              <TableRow key={String(ev.id ?? i)}>
                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {String(ev.created_at ?? '').slice(0, 19).replace('T', ' ')}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{String(ev.event_type)}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{String(ev.guest_id ?? '—')}</TableCell>
                <TableCell>{String(ev.ability_executed ?? (ev.abilities as string[])?.[0] ?? '—')}</TableCell>
                <TableCell>
                  {ev.confidence != null ? Number(ev.confidence).toFixed(2) : '—'}
                </TableCell>
                <TableCell>
                  {ev.total_latency_ms != null ? `${ev.total_latency_ms}ms` : '—'}
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {ev.staff_action_logged ? 'staff ' : ''}
                  {ev.fallback_used ? 'fallback ' : ''}
                  {ev.prompt_cache_hit ? 'cache' : ''}
                </TableCell>
              </TableRow>
            ))}
            {(query.data?.events?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-slate-500">
                  No events in this period.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </DashboardShell>
  );
}
