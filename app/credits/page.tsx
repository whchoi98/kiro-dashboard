import Header from '@/app/components/layout/Header';
import ClientPieChart from '@/app/components/charts/PieChart';
import { CreditAnalysis, ClientDistribution } from '@/types/dashboard';

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

const TIER_COLORS: Record<string, string> = {
  Pro: '#6366f1',
  ProPlus: '#f97316',
  Power: '#22d3ee',
};

export default async function CreditsPage() {
  const credits = await fetchData<CreditAnalysis>('/api/credits');

  // Build base vs overage pie data
  const totalBVO = (credits?.baseVsOverage.base ?? 0) + (credits?.baseVsOverage.overage ?? 0);
  const bvoPieData: ClientDistribution[] = totalBVO > 0
    ? [
        {
          clientType: 'Base',
          messageCount: 0,
          creditCount: credits?.baseVsOverage.base ?? 0,
          percentage: ((credits?.baseVsOverage.base ?? 0) / totalBVO) * 100,
        },
        {
          clientType: 'Overage',
          messageCount: 0,
          creditCount: credits?.baseVsOverage.overage ?? 0,
          percentage: ((credits?.baseVsOverage.overage ?? 0) / totalBVO) * 100,
        },
      ]
    : [
        { clientType: 'Base', messageCount: 0, creditCount: 0, percentage: 100 },
        { clientType: 'Overage', messageCount: 0, creditCount: 0, percentage: 0 },
      ];

  const maxCredits = credits?.topUsers[0]?.totalCredits ?? 1;

  return (
    <div className="flex flex-col gap-6">
      <Header title="Credits" subtitle="Credit usage analysis by user and subscription tier" />

      {/* Top credit users */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Top 15 Credit Users</h3>
        <div className="flex flex-col gap-3">
          {(credits?.topUsers ?? []).map((user, index) => {
            const barPct = maxCredits > 0 ? (user.totalCredits / maxCredits) * 100 : 0;
            return (
              <div key={user.userid} className="flex items-center gap-3">
                <span className="text-slate-500 text-xs w-5 text-right font-mono">#{index + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-200 text-sm font-medium">{user.username}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">{user.totalCredits.toLocaleString()} credits</span>
                      {user.overageCredits > 0 && (
                        <span className="text-pink-400">{user.overageCredits.toLocaleString()} overage</span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-dashboard-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: index === 0 ? '#f97316' : index === 1 ? '#6366f1' : '#0ea5e9',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {!credits?.topUsers.length && (
            <p className="text-slate-500 text-sm">No data available</p>
          )}
        </div>
      </div>

      {/* Base vs Overage pie + tier breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <ClientPieChart data={bvoPieData} title="Base vs Overage Credits" />
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Credits by Subscription Tier</h3>
          <div className="flex flex-col gap-3">
            {(credits?.byTier ?? []).map((tier) => (
              <div
                key={tier.tier}
                className="flex items-center justify-between p-4 rounded-lg border border-dashboard-border"
                style={{ borderLeft: `3px solid ${TIER_COLORS[tier.tier] ?? '#64748b'}` }}
              >
                <div>
                  <p className="text-white font-semibold">{tier.tier}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{tier.userCount} users</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{tier.totalCredits.toLocaleString()}</p>
                  <p className="text-slate-500 text-xs">credits used</p>
                </div>
              </div>
            ))}
            {!credits?.byTier.length && (
              <p className="text-slate-500 text-sm">No data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
