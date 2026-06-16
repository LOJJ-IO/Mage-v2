'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import type { TimeseriesResponse } from '@/lib/dashboardApi';

const chartConfig = {
  messages: { label: 'Handled', color: '#05944F' },
  escalations: { label: 'Escalations', color: '#E11900' },
};

export function VolumeAreaChart({ data }: { data: TimeseriesResponse['series'] }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle className="font-heading text-base">Conversation volume</CardTitle>
        <CardDescription>Messages handled vs staff escalations over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#05944F" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#05944F" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => String(v).slice(5)}
            />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="messages"
              name="Handled"
              stroke="#05944F"
              fill="url(#fillMessages)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="escalations"
              name="Escalations"
              stroke="#E11900"
              fill="transparent"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
