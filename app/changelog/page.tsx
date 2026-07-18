import fs from 'fs';
import path from 'path';
import ChangelogClient from './ChangelogClient';

// CHANGELOG.md is not shipped in the standalone Docker runtime image,
// so this page must be statically prerendered at build time.
export const dynamic = 'force-static';

let raw = '';
try {
  raw = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf-8');
} catch {
  raw = '';
}

// The file layout is: '# Changelog' intro → '# English' section → '# 한국어' section.
const koreanStart = raw.search(/^# 한국어$/m);
const english = koreanStart >= 0 ? raw.slice(0, koreanStart) : raw;
const korean = koreanStart >= 0 ? raw.slice(koreanStart) : raw;

export default function ChangelogPage() {
  return <ChangelogClient english={english} korean={korean} />;
}
