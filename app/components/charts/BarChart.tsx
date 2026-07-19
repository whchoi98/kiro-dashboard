'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TopUser } from '@/types/dashboard';
import { useChartTheme } from '@/lib/chart-theme';

const TOP_COLORS = ['#f97316', '#6366f1', '#0ea5e9'];
const DEFAULT_COLOR = '#64748b';

interface UserBarChartProps {
  data: TopUser[];
  title: string;
}

export default function UserBarChart({ data, title }: UserBarChartProps) {
  const chartTheme = useChartTheme();
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <div style={{ height: Math.max(200, data.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fill: chartTheme.tick, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              tick={{ fill: chartTheme.tick, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: chartTheme.tooltipBg,
                border: `1px solid ${chartTheme.tooltipBorder}`,
                borderRadius: 8,
                color: chartTheme.tooltipText,
                fontSize: 12,
              }}
              cursor={{ fill: chartTheme.cursorFill }}
            />
            <Bar dataKey="totalMessages" name="Messages" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index < 3 ? TOP_COLORS[index] : DEFAULT_COLOR}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
