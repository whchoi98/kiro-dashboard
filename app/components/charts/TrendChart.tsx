'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DailyTrend } from '@/types/dashboard';

interface TrendChartProps {
  data: DailyTrend[];
}

export default function TrendChart({ data }: TrendChartProps) {
  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#f1f5f9',
              fontSize: 12,
            }}
            labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}
          />
          <Bar dataKey="messages" name="Messages" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
          <Bar dataKey="conversations" name="Conversations" stackId="a" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
