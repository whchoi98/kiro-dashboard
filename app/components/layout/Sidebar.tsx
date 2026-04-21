'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import KiroLogo from './KiroLogo';
import { useI18n } from '@/lib/i18n';

function MiniKiro({ size = 20, active = false, accentColor = '#9046FF' }: { size?: number; active?: boolean; accentColor?: string }) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 2500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [active]);

  const eyeScale = blink ? 0.1 : 1;
  const id = `mk-${size}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1200 1200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: active ? `drop-shadow(0 0 4px ${accentColor}60)` : undefined,
        transition: 'filter 0.3s',
      }}
    >
      <rect width="1200" height="1200" rx="260" fill={active ? accentColor : '#4a4a5a'} />
      <mask id={id} style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="272" y="202" width="655" height="796">
        <path d="M926.578 202.793H272.637V997.857H926.578V202.793Z" fill="white" />
      </mask>
      <g mask={`url(#${id})`}>
        <path
          d="M398.554 818.914C316.315 1001.03 491.477 1046.74 620.672 940.156C658.687 1059.66 801.052 970.473 852.234 877.795C964.787 673.567 919.318 465.357 907.64 422.374C827.637 129.443 427.623 128.946 358.8 423.865C342.651 475.544 342.402 534.18 333.458 595.051C328.986 625.86 325.507 645.488 313.83 677.785C306.873 696.424 297.68 712.819 282.773 740.645C259.915 783.881 269.604 867.113 387.87 823.883L399.051 818.914H398.554Z"
          fill="white"
        />
        <g style={{ transform: `scaleY(${eyeScale})`, transformOrigin: '636px 486px', transition: 'transform 0.08s' }}>
          <path d="M636.123 549.353C603.328 549.353 598.359 510.097 598.359 486.742C598.359 465.623 602.086 448.977 609.293 438.293C615.504 428.852 624.697 424.131 636.123 424.131C647.555 424.131 657.492 428.852 664.447 438.541C672.398 449.474 676.623 466.12 676.623 486.742C676.623 525.998 661.471 549.353 636.375 549.353H636.123Z" fill="black" />
        </g>
        <g style={{ transform: `scaleY(${eyeScale})`, transformOrigin: '771px 486px', transition: 'transform 0.08s' }}>
          <path d="M771.24 549.353C738.445 549.353 733.477 510.097 733.477 486.742C733.477 465.623 737.203 448.977 744.41 438.293C750.621 428.852 759.814 424.131 771.24 424.131C782.672 424.131 792.609 428.852 799.564 438.541C807.516 449.474 811.74 466.12 811.74 486.742C811.74 525.998 796.588 549.353 771.492 549.353H771.24Z" fill="black" />
        </g>
      </g>
    </svg>
  );
}

const navItems = [
  { key: 'nav.overview', href: '/', accent: '#9046FF' },
  { key: 'nav.users', href: '/users', accent: '#6366f1' },
  { key: 'nav.trends', href: '/trends', accent: '#0ea5e9' },
  { key: 'nav.credits', href: '/credits', accent: '#22d3ee' },
  { key: 'nav.productivity', href: '/productivity', accent: '#22c55e' },
  { key: 'nav.engagement', href: '/engagement', accent: '#ec4899' },
  { key: 'nav.analyze', href: '/analyze', accent: '#f59e0b' },
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
              <MiniKiro size={20} active={isActive} accentColor={item.accent} />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

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
