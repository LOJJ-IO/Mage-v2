'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getDashboardKey, setDashboardKey } from '@/lib/dashboardApi';

export function DashboardKeyGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = getDashboardKey();
    if (!stored) {
      setReady(true);
      return;
    }
    fetch('/api/dashboard/config', { headers: { 'X-Dashboard-Key': stored } })
      .then((res) => {
        if (res.ok) setUnlocked(true);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (unlocked) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDashboardKey(key.trim());
    try {
      const res = await fetch('/api/dashboard/config', {
        headers: { 'X-Dashboard-Key': key.trim() },
      });
      if (!res.ok) throw new Error('Invalid key');
      setUnlocked(true);
    } catch {
      setError('Invalid dashboard key');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg"
      >
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-700">Mage Analytics</p>
        <p className="font-heading mt-2 text-3xl font-semibold text-slate-900">Dashboard access</p>
        <p className="mt-2 text-sm text-slate-500">Enter your dashboard key to view metrics.</p>
        <Input
          className="mt-6"
          type="password"
          placeholder="Dashboard key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
        />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="mt-4 w-full">
          Unlock dashboard
        </Button>
      </form>
    </div>
  );
}
