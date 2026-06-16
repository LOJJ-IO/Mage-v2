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

export interface MarketingSummary {
  period_days: number;
  tracking: TrackingConfig;
  summary: {
    calls_avoided: number;
    labor_saved_usd: number;
    time_saved_minutes: number;
    guest_satisfaction_pct: number;
    happy_guests: number;
    total_guests_scored: number;
    avg_response_ms: number;
    p95_response_ms: number;
    handled_without_staff_pct: number;
    escalation_rate_pct: number;
    total_messages: number;
    dau: number;
    wau: number;
    wow_growth_pct: number;
  };
  recent_wins: Array<{
    guest_id?: string;
    ability?: string;
    response_ms?: number;
    happiness_score?: number;
    summary?: string;
    created_at?: string;
  }>;
}

export interface DevMetricsResponse {
  period_days: number;
  tracking: TrackingConfig;
  metrics: Record<string, unknown>;
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
};
