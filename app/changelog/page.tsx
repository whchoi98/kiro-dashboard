import fs from 'fs';
import path from 'path';
import ChangelogClient from './ChangelogClient';

// CHANGELOG.md is not shipped in the standalone Docker runtime image,
// so this page must be statically prerendered at build time.
export const dynamic = 'force-static';

// Read unguarded on purpose. A swallowed failure here used to render the page
// as "No changelog entries available" while the build stayed green — which is
// exactly what `.dockerignore` excluding `*.md` caused, unnoticed across
// releases. CHANGELOG.md is a required build input; if it is missing, the
// build must fail rather than ship an empty page.
// See tests/structure/changelog-build-input.test.ts.
const raw = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf-8');

// The file layout is: '# Changelog' intro → '# English' section → '# 한국어' section.
const koreanStart = raw.search(/^# 한국어$/m);
const english = koreanStart >= 0 ? raw.slice(0, koreanStart) : raw;
const korean = koreanStart >= 0 ? raw.slice(koreanStart) : raw;

export default function ChangelogPage() {
  return <ChangelogClient english={english} korean={korean} />;
}
