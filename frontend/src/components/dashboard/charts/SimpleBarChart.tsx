'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';

const COLORS = ['#05944F', '#276EF1', '#8B5CF6', '#F59E0B', '#E11900', '#64748B'];

export function SimpleBarChart({
  title,
  description,
  data,
  dataKey = 'value',
  nameKey = 'name',
}: {
  title: string;
  description?: string;
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  nameKey?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ value: { color: '#05944F' } }} className="h-[280px] w-full">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey={nameKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={32} />
            <Tooltip />
            <Bar dataKey={dataKey} radius={[6, 6, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
