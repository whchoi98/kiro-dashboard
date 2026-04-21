'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import UserBarChart from '@/app/components/charts/BarChart';
import UserTable from '@/app/components/tables/UserTable';
import UserDetailPanel from '@/app/components/ui/UserDetailPanel';
import { TopUser } from '@/types/dashboard';

export default function UsersPage() {
  const [days, setDays] = useState(90);
  const [top10, setTop10] = useState<TopUser[]>([]);
  const [top100, setTop100] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/users?days=${days}&limit=10`).then((r) => r.json()),
      fetch(`/api/users?days=${days}&limit=100`).then((r) => r.json()),
    ])
      .then(([t10, t100]) => {
        if (!cancelled) {
          setTop10(t10 ?? []);
          setTop100(t100 ?? []);
        }
      })
      .catch(() => {
        // Keep existing data on error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.users"
        subtitleKey="header.users.sub"
        mascotMood="happy"
        days={days}
        onDaysChange={setDays}
      />

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <UserBarChart data={top10} title="Top 10 Users by Messages" />
      </div>

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">User Activity Table</h3>
        <UserTable data={top100} onUserClick={(id) => setSelectedUserId(id)} />
      </div>

      <UserDetailPanel
        userId={selectedUserId}
        days={days}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}
