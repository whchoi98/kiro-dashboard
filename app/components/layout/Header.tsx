'use client';

import { useRouter } from 'next/navigation';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="bg-dashboard-card border border-dashboard-border text-slate-400 text-xs font-medium px-3 py-1.5 rounded-full">
          Last 30 days
        </span>
        <button
          onClick={() => router.refresh()}
          className="bg-kiro-orange hover:bg-kiro-orange-dark text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors duration-150"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
