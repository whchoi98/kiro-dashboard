import { NextRequest, NextResponse } from 'next/server';
import { currentReleaseNotes, releaseSections } from '@/lib/release-notes';
import { APP_VERSION } from '@/lib/version';
import type { ReleaseNotesResponse } from '@/types/dashboard';

/**
 * NOT force-static, even though the payload derives from a build-time-inlined
 * CHANGELOG.md and cannot change while the container runs.
 *
 * Under `force-static` Next.js prerenders this route once and hands the handler
 * an EMPTY searchParams, so `?locale=en` silently resolved to the `ko` default
 * and every locale got the Korean notes baked into `.next/server/.../
 * release-notes.body`. Response caching is not worth serving one language.
 *
 * The work is a string parse over an already-in-memory constant, and
 * lib/release-notes.ts memoizes it per locale, so serving this dynamically
 * costs a JSON.stringify.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get('locale') === 'en' ? 'en' : 'ko';

  const section = currentReleaseNotes(locale);

  // No 404 when the version has no entry yet: the version badge always needs
  // something to show, and `currentReleaseNotes` already falls back to the
  // newest real release. An empty `section` means the changelog has no
  // releases at all, which the dialog renders as an empty state.
  return NextResponse.json({
    version: APP_VERSION,
    // True when the notes shown are for a different version than the running
    // build — the dialog labels that case instead of implying a match.
    exact: section?.version.trim() === APP_VERSION,
    section,
    // Older versions the dialog offers as a "see also" list; the full history
    // lives on /changelog.
    history: releaseSections(locale)
      .map((s) => ({ version: s.version, date: s.date }))
      .slice(0, 8),
  } satisfies ReleaseNotesResponse);
}
