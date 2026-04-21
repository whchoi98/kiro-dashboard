import Header from '@/app/components/layout/Header';
import UserBarChart from '@/app/components/charts/BarChart';
import UserTable from '@/app/components/tables/UserTable';
import { TopUser } from '@/types/dashboard';

const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

async function fetchData<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(baseUrl + path, {
      next: { revalidate: 300, tags: ['dashboard'] },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export default async function UsersPage() {
  const [top10, top100] = await Promise.all([
    fetchData<TopUser[]>('/api/users?limit=10'),
    fetchData<TopUser[]>('/api/users?limit=100'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Header titleKey="header.users" subtitleKey="header.users.sub" mascotMood="happy" />

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <UserBarChart data={top10 ?? []} title="Top 10 Users by Messages" />
      </div>

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">User Activity Table</h3>
        <UserTable data={top100 ?? []} />
      </div>
    </div>
  );
}
