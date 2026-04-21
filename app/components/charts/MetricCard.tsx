'use client';

import { ReactNode } from 'react';
import KiroIcon from '@/app/components/ui/KiroIcon';

interface MetricCardProps {
  title: string;
  value: string;
  changeRate: number;
  accentColor: string;
  icon?: ReactNode;
  subtitle?: string;
  detail?: string;
}

export default function MetricCard({
  title,
  value,
  changeRate,
  accentColor,
  icon,
  subtitle,
  detail,
}: MetricCardProps) {
  const isPositive = changeRate >= 0;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70 group">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          {title}
        </span>
        <span
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          {icon ?? <KiroIcon size={22} />}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-4xl font-bold font-mono text-white">{value}</span>
        {subtitle && (
          <span className="text-sm text-gray-400">{subtitle}</span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-sm text-gray-400">{detail || 'Last 30 days'}</span>
        <span
          className={`text-sm font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {isPositive ? '▲' : '▼'} {Math.abs(changeRate).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
