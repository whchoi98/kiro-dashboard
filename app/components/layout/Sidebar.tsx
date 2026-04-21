'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import KiroLogo from './KiroLogo';
import { useI18n } from '@/lib/i18n';

const navItems = [
  {
    key: 'nav.overview',
    href: '/',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    key: 'nav.users',
    href: '/users',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: 'nav.trends',
    href: '/trends',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    key: 'nav.credits',
    href: '/credits',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  {
    key: 'nav.productivity',
    href: '/productivity',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    key: 'nav.engagement',
    href: '/engagement',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-dashboard-sidebar flex flex-col z-30 border-r border-gray-800/50">
      <KiroLogo />
      <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[#9046FF] text-white shadow-lg shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              {item.icon}
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      {/* Language Toggle */}
      <div className="px-4 py-3 border-t border-gray-800/50">
        <div className="flex rounded-lg bg-gray-900/80 p-0.5">
          <button
            onClick={() => setLocale('ko')}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
              locale === 'ko'
                ? 'bg-[#9046FF] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            KO
          </button>
          <button
            onClick={() => setLocale('en')}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
              locale === 'en'
                ? 'bg-[#9046FF] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            EN
          </button>
        </div>
      </div>
    </aside>
  );
}
