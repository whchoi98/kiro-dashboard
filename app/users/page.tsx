'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '@/app/components/layout/Header';
import { SkeletonGate } from '@/app/components/ui/PageSkeleton';
import { pageBodyOpacityClass } from '@/lib/skeleton-layout';
import UserBarChart from '@/app/components/charts/BarChart';
import UserTable from '@/app/components/tables/UserTable';
import UserDetailPanel from '@/app/components/ui/UserDetailPanel';
import { TopUser } from '@/types/dashboard';

export default function UsersPage() {
  const [days, setDays] = useState(90);
  const [top100, setTop100] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // ONE request, not two. This used to fetch `limit=10` and `limit=100` side by
  // side — the same query twice. Slicing is exactly equivalent: /api/users
  // applies a single fixed `ORDER BY total_messages DESC` before `LIMIT`, and
  // `rank` is positional (index + 1), so ranks 1..10 survive the slice.
  //
  // The win is resource, not latency — the two fetches were already concurrent.
  // Every /api/users call runs resolveUserDetails, which walks the ENTIRE
  // IdentityStore directory with do/while pagination, so this halves that walk
  // plus one Athena query per load. It also makes the chart and the table
  // consistent by construction: `total_messages DESC` is not a total order, so
  // two independent queries could disagree at a tie boundary and show a user in
  // the chart who was absent from the table's top 10.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/users?days=${days}&limit=100`)
      .then((r) => r.json())
      .then((t100) => {
        // API may return `{ error: ... }` on failure — don't pass that to children
        // that expect an array. The backend also returns an empty array when the
        // underlying Glue table is not provisioned yet.
        if (!cancelled) setTop100(Array.isArray(t100) ? t100 : []);
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

  const top10 = useMemo(() => top100.slice(0, 10), [top100]);

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${pageBodyOpacityClass(loading, top100.length > 0)}`}>
      <Header
        titleKey="header.users"
        subtitleKey="header.users.sub"
        mascotMood="happy"
        mascotTheme="users"
        days={days}
        onDaysChange={setDays}
      />

      <SkeletonGate variant="chart" loading={loading} hasData={top100.length > 0}>

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <UserBarChart data={top10} title="Top 10 Users by Messages" />
      </div>

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">User Activity Table</h3>
        <UserTable data={top100} onUserClick={(id) => setSelectedUserId(id)} />
      </div>

      </SkeletonGate>

      {/* Outside the gate: the panel is an overlay driven by its own state, not
          part of the page body the skeleton stands in for. */}
      <UserDetailPanel
        userId={selectedUserId}
        days={days}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}
