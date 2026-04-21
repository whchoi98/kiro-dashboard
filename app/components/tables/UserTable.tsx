'use client';

import { useState, useMemo } from 'react';
import { TopUser } from '@/types/dashboard';

interface UserTableProps {
  data: TopUser[];
}

type SortField = 'totalMessages' | 'totalCredits';
type SortDir = 'asc' | 'desc';

export default function UserTable({ data }: UserTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalMessages');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const items = q
      ? data.filter(
          (u) =>
            u.username.toLowerCase().includes(q) ||
            u.userid.toLowerCase().includes(q)
        )
      : data;

    return [...items].sort((a, b) => {
      const diff = a[sortField] - b[sortField];
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [data, search, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <span className="text-slate-600 ml-1">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 2L8 6H2L5 2Z" opacity="0.5" />
            <path d="M5 8L2 4h6L5 8Z" opacity="0.5" />
          </svg>
        </span>
      );
    }
    return (
      <span className="text-kiro-orange ml-1">
        {sortDir === 'asc' ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 2L8 7H2L5 2Z" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 8L2 3h6L5 8Z" />
          </svg>
        )}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
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
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-dashboard-card border border-dashboard-border rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-kiro-orange focus:ring-1 focus:ring-kiro-orange"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-dashboard-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dashboard-border bg-dashboard-sidebar">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-12">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                User
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none whitespace-nowrap hover:text-slate-300 transition-colors"
                onClick={() => handleSort('totalMessages')}
              >
                Messages
                <SortIcon field="totalMessages" />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none whitespace-nowrap hover:text-slate-300 transition-colors"
                onClick={() => handleSort('totalCredits')}
              >
                Credits
                <SortIcon field="totalCredits" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No users match your search.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.userid}
                  className="border-b border-dashboard-border last:border-0 hover:bg-dashboard-card-hover transition-colors duration-100"
                >
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    #{user.rank}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-slate-200 font-medium">{user.username}</span>
                      <span className="text-slate-500 text-xs font-mono">{user.userid.substring(0, 12)}...</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-200 font-medium tabular-nums">
                    {user.totalMessages.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-200 font-medium tabular-nums">
                    {user.totalCredits.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 text-right">
        {filtered.length} of {data.length} users
      </p>
    </div>
  );
}
