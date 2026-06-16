'use client';

import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';

const COLORS = ['#05944F', '#276EF1', '#8B5CF6', '#F59E0B', '#E11900', '#64748B', '#14B8A6', '#EC4899'];

export function SimplePieChart({
  title,
  description,
  data,
}: {
  title: string;
  description?: string;
  data: Array<{ name: string; value: number }>;
}) {
  const filtered = data.filter((d) => d.value > 0);
  const empty = filtered.length === 0;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle className="font-heading text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-12 text-center text-sm text-slate-400">No data yet</p>
        ) : (
          <ChartContainer config={{ value: { color: '#05944F' } }} className="mx-auto h-[240px] w-full max-w-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={filtered}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={88}
                  paddingAngle={3}
                >
                  {filtered.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
        {!empty ? (
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {filtered.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {item.name} ({item.value})
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
