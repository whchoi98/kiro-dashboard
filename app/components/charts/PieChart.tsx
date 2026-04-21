'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { ClientDistribution } from '@/types/dashboard';

const COLORS = ['#f97316', '#6366f1', '#22d3ee', '#a78bfa', '#ec4899'];

interface PieChartProps {
  data: ClientDistribution[];
  title: string;
}

export default function ClientPieChart({ data, title }: PieChartProps) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="percentage"
              nameKey="clientType"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Share']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2">
        {data.map((entry, index) => (
          <div key={entry.clientType} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-slate-400">{entry.clientType}</span>
            </div>
            <span className="text-slate-300 font-medium">{entry.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
