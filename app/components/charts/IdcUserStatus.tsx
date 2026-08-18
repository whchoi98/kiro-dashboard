'use client';

import { useState, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { compareByKey, SortDir, SortKind } from '@/lib/table-sort';
import { DormancyBucket, DormancySummary, FunnelStep } from '@/types/dashboard';

export interface IdcUserStatus {
  userId: string;
  displayName: string;
  email: string;
  status: 'active' | 'inactive';
  totalMessages: number;
  totalCredits: number;
  lastActive: string | null;
  organization: string;
  daysSinceLastActive?: number | null;
  activeDays?: number;
  dormancy?: DormancyBucket;
  firstSeenAt?: string | null;
  isNewRegistrant?: boolean;
}

interface IdcUserStatusData {
  total: number;
  active: number;
  inactive: number;
  users: IdcUserStatus[];
  /** Optional so the placeholder payloads in app/page.tsx stay valid. */
  windowDays?: number;
  dormancy?: DormancySummary[];
  funnel?: FunnelStep[];
  newRegistrants?: number;
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'new';

const FILTER_LABEL_KEYS: Record<StatusFilter, string> = {
  all: 'idc.filter.all',
  active: 'idc.filter.active',
  inactive: 'idc.filter.inactive',
  new: 'idc.newRegistrant',
};

type SortKey =
  | 'status'
  | 'displayName'
  | 'email'
  | 'organization'
  | 'totalMessages'
  | 'totalCredits'
  | 'activeDays'
  | 'lastActive'
  | 'daysSinceLastActive';

// Column config drives BOTH the thead render and the comparator kind.
// thClass values are verbatim from the previous hardcoded <th> blocks.
const COLUMNS: Array<{ key: SortKey; labelKey: string; kind: SortKind; thClass: string }> = [
  { key: 'status', labelKey: 'idc.status', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-24' },
  { key: 'displayName', labelKey: 'idc.name', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-40' },
  { key: 'email', labelKey: 'idc.email', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider min-w-[220px]' },
  { key: 'organization', labelKey: 'idc.org', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-44' },
  { key: 'totalMessages', labelKey: 'metric.messages', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28' },
  { key: 'totalCredits', labelKey: 'metric.credits', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28' },
  { key: 'activeDays', labelKey: 'idc.activeDays', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-24' },
  { key: 'lastActive', labelKey: 'idc.lastActive', kind: 'string', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-32' },
  { key: 'daysSinceLastActive', labelKey: 'idc.daysSinceActive', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-24' },
];

/**
 * Bucket colours run fresh → stale. `never` is deliberately neutral slate, not
 * red: these are directory users with no Kiro activity, which is not a fault
 * condition — the directory is not a subscription roster.
 */
const BUCKET_COLORS: Record<DormancyBucket, string> = {
  active7: '#22c55e',
  dormant30: '#84cc16',
  dormant60: '#f59e0b',
  dormantOld: '#f97316',
  never: '#64748b',
};

interface IdcUserStatusProps {
  data: IdcUserStatusData;
  onUserClick?: (userId: string) => void;
}

const ORG_COLORS: Record<string, string> = {
  'daangn.com': 'bg-orange-500/20 text-orange-300',
  'daangnpay.com': 'bg-orange-500/20 text-orange-300',
  'gsretail.com': 'bg-blue-500/20 text-blue-300',
  'cj.net': 'bg-red-500/20 text-red-300',
  'amazon.com': 'bg-amber-500/20 text-amber-300',
  'hyundai.com': 'bg-cyan-500/20 text-cyan-300',
  'hybecorp.com': 'bg-pink-500/20 text-pink-300',
  'ssg.com': 'bg-rose-500/20 text-rose-300',
  'kakaoinsurecorp.com': 'bg-yellow-500/20 text-yellow-300',
  'kakaopaysec.com': 'bg-yellow-500/20 text-yellow-300',
  'toss.im': 'bg-blue-500/20 text-blue-300',
  'gmail.com': 'bg-sky-500/20 text-sky-300',
  'naver.com': 'bg-green-500/20 text-green-300',
  'hanafn.com': 'bg-emerald-500/20 text-emerald-300',
  'dunamu.com': 'bg-indigo-500/20 text-indigo-300',
  'kbs.co.kr': 'bg-violet-500/20 text-violet-300',
  'cnspartner.com': 'bg-teal-500/20 text-teal-300',
  'nol-universe.com': 'bg-fuchsia-500/20 text-fuchsia-300',
  'ilevit.com': 'bg-lime-500/20 text-lime-300',
};

const DEFAULT_ORG_COLORS = [
  'bg-indigo-500/20 text-indigo-300',
  'bg-teal-500/20 text-teal-300',
  'bg-rose-500/20 text-rose-300',
  'bg-amber-500/20 text-amber-300',
  'bg-violet-500/20 text-violet-300',
];

function getOrgColor(org: string, index: number): string {
  if (!org) return 'bg-gray-500/20 text-gray-400';
  if (ORG_COLORS[org]) return ORG_COLORS[org];
  return DEFAULT_ORG_COLORS[index % DEFAULT_ORG_COLORS.length];
}

function StatCard({
  label,
  value,
  colorClass,
  dot,
}: {
  label: string;
  value: number;
  colorClass: string;
  dot?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
        <span className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
      </div>
      <span className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
    </div>
  );
}

export default function IdcUserStatusComponent({ data, onUserClick }: IdcUserStatusProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  // asc → desc → back to the server's default order (active → new → inactive).
  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const orgIndex = useMemo(() => {
    const seen = new Map<string, number>();
    let idx = 0;
    for (const user of data.users) {
      if (user.organization && !seen.has(user.organization)) {
        seen.set(user.organization, idx++);
      }
    }
    return seen;
  }, [data.users]);

  const filtered = useMemo(() => {
    let rows = data.users;
    if (statusFilter === 'active') rows = rows.filter((u) => u.status === 'active');
    else if (statusFilter === 'inactive') rows = rows.filter((u) => u.status === 'inactive');
    else if (statusFilter === 'new') rows = rows.filter((u) => u.isNewRegistrant);
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.organization.toLowerCase().includes(q),
    );
  }, [data.users, search, statusFilter]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return filtered;
    return [...filtered].sort(compareByKey<IdcUserStatus>(sort.key, col.kind, sort.dir));
  }, [filtered, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t('idc.total')}
          value={data.total}
          colorClass="text-[#9046FF]"
        />
        <StatCard
          label={t('idc.active')}
          value={data.active}
          colorClass="text-emerald-400"
          dot="bg-emerald-500"
        />
        <StatCard
          label={t('idc.inactive')}
          value={data.inactive}
          colorClass="text-gray-400"
          dot="bg-gray-500"
        />
        <StatCard
          label={t('idc.awaitingFirst')}
          value={data.newRegistrants ?? 0}
          colorClass="text-[#9046FF]"
          dot="bg-[#9046FF]"
        />
      </div>

      {/* Dormancy grading + directory→activity funnel. Both describe DIRECTORY
          users; the note under the heading is required wording, not decoration. */}
      {!!data.dormancy?.length && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h3 className="text-lg font-semibold text-slate-300">{t('idc.dormancy')}</h3>
              {!!data.windowDays && (
                <span className="text-xs text-gray-500 font-mono">{data.windowDays}d</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 mb-4">{t('idc.dormancyNote')}</p>
            <div className="flex flex-col gap-2.5">
              {data.dormancy.map((row) => (
                <div key={row.bucket}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300">{t(`idc.bucket.${row.bucket}`)}</span>
                    <span className="text-sm font-mono text-gray-400">
                      {row.count.toLocaleString()} · {row.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${row.percentage}%`,
                        backgroundColor: BUCKET_COLORS[row.bucket],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('idc.funnel')}</h3>
            <div className="flex flex-col gap-3">
              {(data.funnel ?? []).map((step, index) => (
                <div key={step.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-gray-300">{t(step.label)}</span>
                    <span className="text-sm font-mono text-gray-200">
                      {step.count.toLocaleString()}
                    </span>
                  </div>
                  {/* Step 0 is the denominator, so a conversion rate there
                      would be a meaningless 100%. */}
                  {index > 0 && (
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      {step.conversionRate.toFixed(1)}% ← {t((data.funnel ?? [])[index - 1].label)}
                    </p>
                  )}
                </div>
              ))}
              {!data.funnel?.length && <p className="text-gray-500 text-sm">No data available</p>}
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('idc.searchPlaceholder')}
          className="w-full bg-gray-900/50 border border-gray-800 rounded-lg pl-8 pr-4 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-[#9046FF]/50 focus:ring-1 focus:ring-[#9046FF]/30"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'active', 'inactive', 'new'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              statusFilter === f
                ? 'border-[#9046FF] text-[#9046FF] bg-[#9046FF]/10'
                : 'border-gray-800 text-gray-400 hover:text-gray-300'
            }`}
          >
            {t(FILTER_LABEL_KEYS[f])}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/70">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  aria-sort={
                    sort?.key === col.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={`${col.thClass} cursor-pointer select-none hover:text-gray-300`}
                >
                  {t(col.labelKey)}
                  {sort?.key === col.key && (
                    <span className="text-[#9046FF]">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-600">
                  {search ? 'No results found' : 'No users'}
                </td>
              </tr>
            )}
            {sorted.map((user) => {
              const isActive = user.status === 'active';
              const orgColorIdx = orgIndex.get(user.organization) ?? 0;
              const orgColor = getOrgColor(user.organization, orgColorIdx);
              const clickable = onUserClick && isActive;

              return (
                <tr
                  key={user.userId}
                  onClick={() => clickable && onUserClick(user.userId)}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${clickable ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-gray-500/10 text-gray-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-emerald-500' : 'bg-gray-500'
                        }`}
                      />
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                    {user.isNewRegistrant && (
                      <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#9046FF]/10 text-[#9046FF]">
                        {t('idc.newRegistrant')}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-gray-200 font-medium whitespace-nowrap">
                    {user.displayName}
                  </td>

                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs break-all">
                    {user.email || '—'}
                  </td>

                  <td className="px-4 py-2.5">
                    {user.organization ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${orgColor}`}
                      >
                        {user.organization}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right font-mono">
                    {isActive ? (
                      <span className="text-gray-200">
                        {user.totalMessages.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-600">0</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right font-mono">
                    {isActive ? (
                      <span className="text-gray-200">
                        {user.totalCredits.toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })}
                      </span>
                    ) : (
                      <span className="text-gray-600">0</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right font-mono">
                    {user.activeDays ? (
                      <span className="text-gray-200">{user.activeDays}</span>
                    ) : (
                      <span className="text-gray-600">0</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right text-gray-400 font-mono text-xs whitespace-nowrap">
                    {user.lastActive ? user.lastActive : <span className="text-gray-600">—</span>}
                  </td>

                  {/* Dormancy dot + elapsed days. `—` means no Kiro activity at
                      all, which is not the same as "0 days ago". */}
                  <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {user.daysSinceLastActive !== null &&
                    user.daysSinceLastActive !== undefined ? (
                      <span className="inline-flex items-center gap-1.5">
                        {user.dormancy && (
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: BUCKET_COLORS[user.dormancy] }}
                          />
                        )}
                        <span className="text-gray-300">{user.daysSinceLastActive}</span>
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(search || statusFilter !== 'all') && (
        <p className="text-xs text-gray-600 text-right">
          {filtered.length} / {data.users.length} {t('idc.registered')}
        </p>
      )}
    </div>
  );
}
