'use client';

import { FunnelStep } from '@/types/dashboard';

const COLORS = ['#f97316', '#6366f1', '#0ea5e9', '#a78bfa', '#ec4899'];

interface FunnelChartProps {
  data: FunnelStep[];
  title: string;
}

export default function FunnelChart({ data, title }: FunnelChartProps) {
  const maxCount = data[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <div className="flex flex-col items-center gap-1.5">
        {data.map((step, index) => {
          const widthPct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
          const color = COLORS[index % COLORS.length];

          return (
            <div key={step.label} className="w-full flex flex-col items-center gap-1">
              <div
                className="flex items-center justify-center rounded-md transition-all duration-300"
                style={{
                  width: `${Math.max(widthPct, 20)}%`,
                  backgroundColor: color,
                  minHeight: 40,
                  opacity: 0.9,
                }}
              >
                <span className="text-white text-xs font-semibold px-2 text-center leading-tight">
                  {step.label}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-white font-medium">
                  {step.count.toLocaleString()}
                </span>
                <span className="text-slate-400">
                  {step.percentage.toFixed(1)}% of total
                </span>
                {index > 0 && (
                  <span className="text-slate-500">
                    ({step.conversionRate.toFixed(1)}% from prev)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
