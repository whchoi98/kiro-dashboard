/**
 * Release notes for the version badge in the sidebar footer.
 *
 * The badge opens a dialog showing what the CURRENT version added, so it needs
 * exactly one section out of CHANGELOG.md — not the whole file that /changelog
 * renders. The selection logic lives here rather than in the dialog component
 * because Jest only collects `*.test.ts`, so logic inside a `.tsx` is
 * unreachable from tests (same rationale as `changelog-md.ts`, `chat-scroll.ts`).
 *
 * CHANGELOG.md is imported, not read: `next.config.js` maps it to
 * `asset/source`, so webpack inlines it as a string at build time. A
 * `readFileSync` would crash at runtime — `output: 'standalone'` ships no
 * markdown. (The /changelog page gets away with a read only because
 * `force-static` runs it at build time.)
 *
 * SERVER-ONLY: reached solely through /api/release-notes. Importing it from a
 * client component would inline all ~50KB of the changelog, both languages,
 * into the bundle of every page — the dialog needs one section.
 */

import CHANGELOG_RAW from '../CHANGELOG.md';
import { APP_VERSION } from './version';
import { parseChangelog, splitLocales, type VersionSection } from './changelog-md';
import type { Locale } from './i18n';

/**
 * `[Unreleased]` is a placeholder heading, not a release. It parses into a
 * section like any other, so picking `sections[0]` blindly would show an empty
 * (or in-progress) entry as if it were the shipped version.
 */
const UNRELEASED = /^unreleased$/i;

export function isReleaseSection(section: VersionSection): boolean {
  return !UNRELEASED.test(section.version.trim());
}

/**
 * The section matching `version`, or — when the changelog has no entry for it
 * yet (a version bump landing before its notes) — the newest real release.
 * Returns null only when the file holds no releases at all.
 */
export function findReleaseSection(
  sections: VersionSection[],
  version: string
): VersionSection | null {
  const releases = sections.filter(isReleaseSection);
  return releases.find((s) => s.version.trim() === version) ?? releases[0] ?? null;
}

/**
 * Parsed per locale on first use and kept. Safe to cache for the process
 * lifetime because the input is a build-time constant, and worth caching
 * because /api/release-notes is dynamic (it must be — `force-static` hands the
 * handler empty searchParams and would freeze one language into the response)
 * and calls this twice per request.
 */
const CACHE = new Map<Locale, VersionSection[]>();

/** Releases newer-to-older, `[Unreleased]` excluded, for the locale's tree. */
export function releaseSections(locale: Locale): VersionSection[] {
  const cached = CACHE.get(locale);
  if (cached) return cached;

  const { english, korean } = splitLocales(CHANGELOG_RAW as string);
  const sections = parseChangelog(locale === 'ko' ? korean : english).filter(isReleaseSection);
  CACHE.set(locale, sections);
  return sections;
}

/** The notes for the running build (`APP_VERSION`) in the requested language. */
export function currentReleaseNotes(locale: Locale): VersionSection | null {
  return findReleaseSection(releaseSections(locale), APP_VERSION);
}
