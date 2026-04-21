'use client';

import { useState, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';

export interface IdcUserStatus {
  userId: string;
  displayName: string;
  email: string;
  status: 'active' | 'inactive';
  totalMessages: number;
  totalCredits: number;
  lastActive: string | null;
  organization: string;
}

interface IdcUserStatusData {
  total: number;
  active: number;
  inactive: number;
  users: IdcUserStatus[];
}

interface IdcUserStatusProps {
  data: IdcUserStatusData;
}

// Deterministic color assignment per org domain
const ORG_COLORS: Record<string, string> = {
  'daangn.com': 'bg-orange-500/20 text-orange-300',
  'gsretail.com': 'bg-blue-500/20 text-blue-300',
  'kakao.com': 'bg-yellow-500/20 text-yellow-300',
  'naver.com': 'bg-green-500/20 text-green-300',
  'samsung.com': 'bg-cyan-500/20 text-cyan-300',
  'lge.com': 'bg-red-500/20 text-red-300',
  'sk.com': 'bg-purple-500/20 text-purple-300',
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
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
      </div>
      <span className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
    </div>
  );
}

export default function IdcUserStatusComponent({ data }: IdcUserStatusProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  // Collect unique orgs for stable color indexing
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
    const q = search.toLowerCase().trim();
    if (!q) return data.users;
    return data.users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.organization.toLowerCase().includes(q),
    );
  }, [data.users, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Stat cards row */}
      <div className="grid grid-cols-3 gap-3">
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
      </div>

      {/* Search */}
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

      {/* Table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/70">
              <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider w-20">
                {t('idc.status')}
              </th>
              <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider">
                {t('idc.name')}
              </th>
              <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider">
                {t('idc.email')}
              </th>
              <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider w-32">
                {t('idc.org')}
              </th>
              <th className="text-right px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider w-24">
                {t('metric.messages')}
              </th>
              <th className="text-right px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider w-24">
                {t('metric.credits')}
              </th>
              <th className="text-right px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider w-28">
                {t('idc.lastActive')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-600">
                  {search ? 'No results found' : 'No users'}
                </td>
              </tr>
            )}
            {filtered.map((user) => {
              const isActive = user.status === 'active';
              const orgColorIdx = orgIndex.get(user.organization) ?? 0;
              const orgColor = getOrgColor(user.organization, orgColorIdx);

              return (
                <tr
                  key={user.userId}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                >
                  {/* Status pill */}
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
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
                  </td>

                  {/* Name */}
                  <td className="px-3 py-2 text-gray-200 font-medium">
                    {user.displayName}
                  </td>

                  {/* Email */}
                  <td className="px-3 py-2 text-gray-400 font-mono text-[11px]">
                    {user.email || '—'}
                  </td>

                  {/* Organization badge */}
                  <td className="px-3 py-2">
                    {user.organization ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${orgColor}`}
                      >
                        {user.organization}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>

                  {/* Messages */}
                  <td className="px-3 py-2 text-right font-mono">
                    {isActive ? (
                      <span className="text-gray-200">
                        {user.totalMessages.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-600">0</span>
                    )}
                  </td>

                  {/* Credits */}
                  <td className="px-3 py-2 text-right font-mono">
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

                  {/* Last Active */}
                  <td className="px-3 py-2 text-right text-gray-400">
                    {user.lastActive ? user.lastActive : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Row count */}
      {search && (
        <p className="text-xs text-gray-600 text-right">
          {filtered.length} / {data.users.length} {t('idc.registered')}
        </p>
      )}
    </div>
  );
}
