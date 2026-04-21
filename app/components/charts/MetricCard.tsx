'use client';

import { ReactNode } from 'react';
import KiroIcon from '@/app/components/ui/KiroIcon';

interface MetricCardProps {
  title: string;
  value: string;
  changeRate: number;
  accentColor: string;
  icon?: ReactNode;
}

export default function MetricCard({ title, value, changeRate, accentColor, icon }: MetricCardProps) {
  const isPositive = changeRate >= 0;
  const changeColor = isPositive ? 'text-green-400' : 'text-red-400';
  const changeSign = isPositive ? '+' : '';

  return (
    <div
      className="bg-dashboard-card rounded-xl p-5 flex flex-col gap-3 border border-dashboard-border relative overflow-hidden"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {title}
        </span>
        <span className="text-slate-500">
          {icon ?? <KiroIcon size={14} />}
        </span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className={`text-sm font-medium ${changeColor}`}>
        {changeSign}{changeRate.toFixed(1)}% vs previous period
      </div>
    </div>
  );
}
