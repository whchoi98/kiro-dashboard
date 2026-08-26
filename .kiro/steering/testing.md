# Testing & Verification

- The gate before any commit or deploy is `npx jest` (41 suites) plus `npm run build`
- **`npm run lint` is broken** — there is no ESLint config, so it drops into an interactive setup prompt and hangs. Never put it in a script, hook, or CI step; use `npx tsc --noEmit` for static checking
- `bash tests/run-all.sh` runs the shell suites (TAP): Claude and Kiro hook behavior, secret-scan patterns, project structure, and the `.kiro/` config contract
- Test layout: `tests/lib/` (pure helpers), `tests/api/` (route contracts, hardcode/date-literal audits), `tests/infra/` (CDK synth assertions), `tests/structure/` (repo invariants), `tests/hooks/` (agent hook scripts)
- New behavior needs a test in the matching directory; bug fixes need a regression test that fails before the fix
- `tests/structure/version-sync.test.ts` pins the four version copies (`package.json`, both CHANGELOG sections, `CLAUDE.md`, README badge) — run it first during a release
- `tests/api/hardcode-audit.test.ts` and `date-literal-audit.test.ts` fail on hardcoded account/bucket values and on `CURRENT_DATE` in SQL; fix the source, never the audit
- CDK changes: `cd infra && npx cdk synth --all` must succeed before deploying
- Clean up temporary files a test run creates; never commit `.next/`, `cdk.out/`, or `tsconfig.tsbuildinfo` changes as part of a feature
