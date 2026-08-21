import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const APP_DIR = join(__dirname, '..', '..', 'app');

/**
 * Every client file that fetches /api data must be wired to the global
 * refresh nonce — otherwise Header's 새로고침 button silently skips it (the
 * original bug: router.refresh() never re-runs client effects).
 */
const EXEMPT = [
  // fetch-on-open semantics: a global refresh must not churn open modals,
  // and reopening already refetches.
  'components/ui/ReleaseNotesDialog.tsx',
  'components/ui/UserDetailPanel.tsx',
  'components/ui/UserModelUsage.tsx',
  // Server component with async server-side fetch — no useEffect to wire
  '(overview)/page.tsx',
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const fetchers = tsxFiles(APP_DIR).filter((f) => {
  const src = readFileSync(f, 'utf8');
  return /(["'`])\/api\//.test(src);
});

describe('refresh wiring', () => {
  it('found the expected fetching files (guards the scan itself)', () => {
    expect(fetchers.length).toBeGreaterThanOrEqual(18);
  });

  it.each(fetchers.map((f) => [f.slice(f.indexOf('app/'))] as const))(
    '%s subscribes to useRefresh (or is exempt)',
    (rel) => {
      const full = join(APP_DIR, '..', rel);
      const src = readFileSync(full, 'utf8');
      const exempt = EXEMPT.some((e) => rel.endsWith(e));
      if (exempt) return;
      expect(src).toContain('useRefresh');
    },
  );
});
