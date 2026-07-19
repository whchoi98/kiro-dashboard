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
import { useChartTheme } from '@/lib/chart-theme';

interface TrendChartProps {
  data: DailyTrend[];
}

export default function TrendChart({ data }: TrendChartProps) {
  const chartTheme = useChartTheme();
  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fill: chartTheme.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: chartTheme.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: chartTheme.tooltipBg,
              border: `1px solid ${chartTheme.tooltipBorder}`,
              borderRadius: 8,
              color: chartTheme.tooltipText,
              fontSize: 12,
            }}
            labelStyle={{ color: chartTheme.tick, marginBottom: 4 }}
            cursor={{ fill: chartTheme.cursorFill }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: chartTheme.tick, paddingTop: 8 }}
          />
          <Bar dataKey="messages" name="Messages" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
          <Bar dataKey="conversations" name="Conversations" stackId="a" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
