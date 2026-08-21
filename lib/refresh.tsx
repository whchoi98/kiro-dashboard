'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface RefreshContextValue {
  nonce: number;
  refresh: () => void;
}

// Default keeps useRefresh safe outside the provider (SSR, tests): nonce is
// stable 0 and refresh is a no-op.
const RefreshContext = createContext<RefreshContextValue>({ nonce: 0, refresh: () => {} });

/**
 * Global manual-refresh signal. Header's 새로고침 button bumps `nonce`; every
 * client page includes `nonce` in its fetch-useEffect deps, so a bump re-runs
 * the SAME code path the days picker already exercises — days selection,
 * scroll, and open panels are preserved. router.refresh() alone cannot do
 * this: it re-renders server components only and never re-runs client effects
 * (the original bug — the button was a no-op on 15 of 16 pages).
 */
export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ nonce, refresh }), [nonce, refresh]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh(): RefreshContextValue {
  return useContext(RefreshContext);
}
