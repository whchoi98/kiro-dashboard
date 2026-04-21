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

const TOP_COLORS = ['#f97316', '#6366f1', '#0ea5e9'];
const DEFAULT_COLOR = '#64748b';

interface UserBarChartProps {
  data: TopUser[];
  title: string;
}

export default function UserBarChart({ data, title }: UserBarChartProps) {
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
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="username"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 12,
              }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
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
