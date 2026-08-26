---
name: refactor-guide
description: Safely restructure kiro-dashboard code — Athena SQL helpers, React components, shared lib modules, types — with a verification gate. Use when asked to refactor, clean up, or extract code ("리팩토링").
---

# Refactor — kiro-dashboard

Target: $ARGUMENTS

## 1. Understand before changing

- Read the target files end to end; do not refactor from a snippet
- Find every caller (`code` tool → search_symbols / pattern_search, or grep)
- Check whether the symbol is exported and used across modules
- Check `tests/` for existing coverage — that is your safety net, and if none
  exists, add it *before* restructuring

## 2. Refactoring targets specific to this project

**Athena SQL** — repeated date windows and aggregations belong in
`lib/athena-window.ts` / `lib/athena.ts`, not copy-pasted into routes. Keep
explicit date literals so Athena result reuse (60 min) still hits.

**S3 direct reads** — month-prefix listing and CSV header parsing live in
`lib/uar-s3.ts`. Routes that hand-roll listing logic should call it instead;
the dynamic `{model}_messages` header handling must not be duplicated
(ADR-0004).

**Components** — repeated `MetricCard` clusters become a composite in
`app/components/charts/`; repeated date-filtered fetch logic becomes a hook.
Chart colors come from `lib/chart-theme.ts`, never inline hex.

**Client surface** — move data fetching out of `'use client'` components where a
server component can pass the data as props.

**Types** — replace `Record<string, string>` Athena rows with interfaces in
`types/dashboard.ts`; add explicit return types to route handlers.

## 3. Verification gate

```bash
npx jest                 # the real gate
npx tsc --noEmit         # type check
npm run build            # production build
bash tests/run-all.sh    # structure + hook tests
```

`npm run lint` is broken in this repo (no ESLint config) — do not use it.

## 4. Documentation

- New/renamed `lib/` module → update `lib/CLAUDE.md`
- New/moved component → update `app/components/CLAUDE.md`
- Changed API response shape → update `app/api/CLAUDE.md` and `types/CLAUDE.md`
- Behavior-neutral refactors do not need a CHANGELOG entry

## Rules

- Never change external behavior — structure only. If behavior must change, stop
  and say so.
- Do not edit `types/dashboard.ts` interfaces except to fix type errors the
  refactor exposes.
- Refactor in small, individually verifiable steps; run the gate before
  declaring done.
