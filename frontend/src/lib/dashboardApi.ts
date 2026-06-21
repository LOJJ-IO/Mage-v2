const STORAGE_KEY = 'mage-dashboard-key';

export function getDashboardKey(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setDashboardKey(key: string) {
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearDashboardKey() {
  sessionStorage.removeItem(STORAGE_KEY);
}

async function dashboardFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getDashboardKey();
  if (!key) throw new Error('Dashboard key required');

  const res = await fetch(`/api/dashboard${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Dashboard-Key': key,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface TrackingConfig {
  env_enabled: boolean;
  db_enabled: boolean;
  active: boolean;
}

export interface MetricLabelMeta {
  measurement_type: 'real' | 'proxy';
  client_reportable?: boolean;
  not_for_client_reporting?: boolean;
  label?: string;
}

export interface PhraseItem {
  text: string;
  count: number;
}

export interface ChartSplitItem {
  name: string;
  value: number;
}

export interface MarketingSummary {
  period_days: number;
  tracking: TrackingConfig;
  data_scope?: string;
  pilot_data_label?: string;
  metric_labels?: Record<string, MetricLabelMeta>;
  summary: {
    resolved_without_escalation_pct: number;
    resolved_without_escalation_count: number;
    handled_without_staff_pct: number;
    request_type_coverage_count: number;
    request_types_seen: string[];
    ability_coverage_count: number;
    abilities_seen: string[];
    conversation_completion_rate_pct: number;
    sessions_completed: number;
    sessions_abandoned: number;
    sessions_in_progress: number;
    calls_avoided: number;
    labor_saved_usd: number;
    time_saved_minutes: number;
    guest_satisfaction_pct: number;
    happy_guests: number;
    total_guests_scored: number;
    avg_response_ms: number;
    p95_response_ms: number;
    escalation_rate_pct: number;
    total_messages: number;
    dau: number;
    wau: number;
    wow_growth_pct: number;
    manual_team_reassignments_count?: number;
    pilot_data?: boolean;
  };
  recent_wins: Array<{
    guest_id?: string;
    ability?: string;
    response_ms?: number;
    happiness_score?: number;
    summary?: string;
    created_at?: string;
  }>;
  phrase_cloud: PhraseItem[];
  chart_splits: {
    handled_vs_escalated: ChartSplitItem[];
    satisfaction_split: ChartSplitItem[];
    ability_mix: ChartSplitItem[];
    request_type_mix: ChartSplitItem[];
    team_reassignment_mix?: ChartSplitItem[];
  };
}

export interface DevMetricsResponse {
  period_days: number;
  tracking: TrackingConfig;
  data_scope?: string;
  metric_labels?: Record<string, MetricLabelMeta>;
  metrics: Record<string, unknown>;
  phrase_cloud: PhraseItem[];
}

export interface TimeseriesResponse {
  metric: string;
  series: Array<{
    date: string;
    messages: number;
    escalations: number;
    value: number;
  }>;
}

export interface EventsResponse {
  total: number;
  offset: number;
  limit: number;
  events: Array<Record<string, unknown>>;
}

export type TranscriptFlagCategory =
  | 'clean_routine'
  | 'edge_case_graceful'
  | 'graceful_escalation'
  | 'multi_turn_success';

export interface ConversationThread {
  guest_id: string;
  session_id: string;
  started_at: string;
  ended_at: string;
  event_count: number;
  outcome: string;
  had_escalation: boolean;
  transcript_flag?: TranscriptFlagRecord;
}

export interface TranscriptFlagRecord {
  id?: string;
  guest_id: string;
  session_id: string;
  category: TranscriptFlagCategory;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export const TRANSCRIPT_FLAG_LABELS: Record<TranscriptFlagCategory, string> = {
  clean_routine: 'Clean routine',
  edge_case_graceful: 'Edge case (graceful)',
  graceful_escalation: 'Graceful escalation',
  multi_turn_success: 'Multi-turn success',
};

export const dashboardApi = {
  getConfig: () => dashboardFetch<TrackingConfig>('/config'),
  patchConfig: (enabled: boolean) =>
    dashboardFetch<TrackingConfig>('/config', {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  getSummary: (days = 30) => dashboardFetch<MarketingSummary>(`/summary?days=${days}`),
  getDev: (days = 30) => dashboardFetch<DevMetricsResponse>(`/dev?days=${days}`),
  getTimeseries: (metric: string, days = 30) =>
    dashboardFetch<TimeseriesResponse>(`/timeseries?metric=${metric}&days=${days}`),
  getEvents: (days = 7, eventType?: string, limit = 100) => {
    const params = new URLSearchParams({ days: String(days), limit: String(limit) });
    if (eventType) params.set('event_type', eventType);
    return dashboardFetch<EventsResponse>(`/events?${params}`);
  },
  getThreads: (days = 30) =>
    dashboardFetch<{ threads: ConversationThread[]; total: number }>(`/threads?days=${days}`),
  getTranscriptFlags: (category?: string) => {
    const params = category ? `?category=${category}` : '';
    return dashboardFetch<{ flags: TranscriptFlagRecord[]; total: number }>(
      `/transcript-flags${params}`
    );
  },
  upsertTranscriptFlag: (body: {
    guest_id: string;
    session_id: string;
    category: TranscriptFlagCategory;
    note?: string;
  }) =>
    dashboardFetch<TranscriptFlagRecord>('/transcript-flags', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteTranscriptFlag: (guestId: string, sessionId: string) =>
    dashboardFetch<{ deleted: boolean }>(
      `/transcript-flags?guest_id=${encodeURIComponent(guestId)}&session_id=${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    ),
};
