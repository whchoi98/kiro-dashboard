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
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition-all hover:border-gray-600 hover:bg-gray-900/70 group">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">
          {title}
        </span>
        <span
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          {icon ?? <KiroIcon size={18} />}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold font-mono text-white">{value}</span>
        {subtitle && (
          <span className="text-xs text-gray-500">{subtitle}</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">{detail || 'Last 30 days'}</span>
        <span
          className={`text-xs font-mono font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {isPositive ? '▲' : '▼'} {Math.abs(changeRate).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
