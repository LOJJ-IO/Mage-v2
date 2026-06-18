'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dashboardApi,
  TRANSCRIPT_FLAG_LABELS,
  type TranscriptFlagCategory,
} from '@/lib/dashboardApi';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const FLAG_CATEGORIES = Object.keys(TRANSCRIPT_FLAG_LABELS) as TranscriptFlagCategory[];

export function EventsTableView() {
  const [days, setDays] = useState(7);
  const [eventType, setEventType] = useState('');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const eventsQuery = useQuery({
    queryKey: ['dashboard-events', days, eventType],
    queryFn: () => dashboardApi.getEvents(days, eventType || undefined, 200),
    refetchInterval: 60_000,
  });

  const threadsQuery = useQuery({
    queryKey: ['dashboard-threads', days],
    queryFn: () => dashboardApi.getThreads(days),
    refetchInterval: 60_000,
  });

  const flagMutation = useMutation({
    mutationFn: dashboardApi.upsertTranscriptFlag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-threads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-events'] });
    },
  });

  const unflagMutation = useMutation({
    mutationFn: ({ guestId, sessionId }: { guestId: string; sessionId: string }) =>
      dashboardApi.deleteTranscriptFlag(guestId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-threads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-events'] });
    },
  });

  const threads = threadsQuery.data?.threads ?? [];
  const filteredThreads =
    flagFilter === 'flagged'
      ? threads.filter((t) => t.transcript_flag)
      : flagFilter === 'unflagged'
        ? threads.filter((t) => !t.transcript_flag)
        : threads;

  return (
    <DashboardShell
      title="Event log"
      subtitle="Raw events and transcript flagging for demo walk-throughs"
      headerRight={<DateRangeSelect value={days} onChange={setDays} />}
    >
      <Tabs defaultValue="threads">
        <TabsList className="mb-4">
          <TabsTrigger value="threads">Conversation threads</TabsTrigger>
          <TabsTrigger value="events">Raw events</TabsTrigger>
        </TabsList>

        <TabsContent value="threads">
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={flagFilter}
              onChange={(e) => setFlagFilter(e.target.value)}
            >
              <option value="all">All threads</option>
              <option value="flagged">Flagged only</option>
              <option value="unflagged">Unflagged</option>
            </select>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Turns</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredThreads.map((thread) => {
                  const draftKey = thread.session_id;
                  const flagged = thread.transcript_flag;
                  return (
                    <TableRow key={thread.session_id}>
                      <TableCell className="font-mono text-xs">{thread.guest_id}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-slate-500">
                        {thread.started_at.slice(0, 16).replace('T', ' ')}
                      </TableCell>
                      <TableCell>{thread.event_count}</TableCell>
                      <TableCell>
                        <Badge variant={thread.outcome === 'completed' ? 'default' : 'secondary'}>
                          {thread.outcome}
                        </Badge>
                        {thread.had_escalation ? (
                          <span className="ml-1 text-xs text-amber-700">esc</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-8 w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs"
                          value={flagged?.category ?? ''}
                          onChange={(e) => {
                            const cat = e.target.value as TranscriptFlagCategory;
                            if (!cat) return;
                            flagMutation.mutate({
                              guest_id: thread.guest_id,
                              session_id: thread.session_id,
                              category: cat,
                              note: noteDraft[draftKey] ?? flagged?.note,
                            });
                          }}
                        >
                          <option value="">Bookmark…</option>
                          {FLAG_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {TRANSCRIPT_FLAG_LABELS[cat]}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Note"
                          value={noteDraft[draftKey] ?? flagged?.note ?? ''}
                          onChange={(e) =>
                            setNoteDraft((prev) => ({ ...prev, [draftKey]: e.target.value }))
                          }
                          onBlur={() => {
                            if (flagged && noteDraft[draftKey] !== undefined) {
                              flagMutation.mutate({
                                guest_id: thread.guest_id,
                                session_id: thread.session_id,
                                category: flagged.category,
                                note: noteDraft[draftKey],
                              });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {flagged ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() =>
                              unflagMutation.mutate({
                                guestId: thread.guest_id,
                                sessionId: thread.session_id,
                              })
                            }
                          >
                            Clear
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredThreads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-slate-500">
                      No conversation threads in this period.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="events">
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
                  <TableHead>Path</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(eventsQuery.data?.events ?? []).map((ev, i) => {
                  const meta = (ev.metadata as Record<string, unknown>) || {};
                  return (
                    <TableRow key={String(ev.id ?? i)}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {String(ev.created_at ?? '').slice(0, 19).replace('T', ' ')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{String(ev.event_type)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{String(ev.guest_id ?? '—')}</TableCell>
                      <TableCell>
                        {String(ev.ability_executed ?? (ev.abilities as string[])?.[0] ?? '—')}
                      </TableCell>
                      <TableCell>
                        {ev.confidence != null ? Number(ev.confidence).toFixed(2) : '—'}
                      </TableCell>
                      <TableCell>
                        {ev.total_latency_ms != null ? `${ev.total_latency_ms}ms` : '—'}
                        {ev.copy_latency_ms != null ? (
                          <span className="block text-[10px] text-slate-400">
                            copy {String(ev.copy_latency_ms)}ms
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {String(meta.routing_path ?? '—')}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {ev.staff_action_logged ? 'staff ' : ''}
                        {ev.fallback_used ? 'fallback ' : ''}
                        {ev.prompt_cache_hit ? 'cache' : ''}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(eventsQuery.data?.events?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-slate-500">
                      No events in this period.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
