---
name: sync-docs-guide
description: Reconcile kiro-dashboard documentation (AGENTS.md, module CLAUDE.md files, docs/) with the actual source tree and report what drifted. Use for "문서 동기화", "sync docs", "docs are out of date".
---

# Sync Docs — kiro-dashboard

Scope: $ARGUMENTS (default: every module doc)

Doc layout in this repo:

| Doc | Covers |
|-----|--------|
| `AGENTS.md` (root) | Kiro's project marker file — stack, directory map, data source, conventions |
| `CLAUDE.md` (root) | Long-form project reference incl. the `**Version**:` line |
| `.kiro/AGENTS.md` | Map of the Kiro configuration itself (agents, hooks, prompts, skills, steering) |
| `app/CLAUDE.md`, `app/api/CLAUDE.md`, `app/components/CLAUDE.md` | Pages, routes, components |
| `lib/CLAUDE.md`, `types/CLAUDE.md` | Shared modules, interfaces |
| `infra/CLAUDE.md`, `infra/lambda/edge-auth/CLAUDE.md` | CDK stacks, edge auth |
| `.kiro/steering/*.md` | Rules the agent must follow every turn — keep terse |
| `docs/architecture.md`, `docs/decisions/`, `docs/runbooks/` | Design and operations |

## 1. Audit against the source tree

```bash
ls app/api                       # vs app/api/CLAUDE.md   (20 routes)
ls app/components/*/             # vs app/components/CLAUDE.md
ls lib types                     # vs lib/CLAUDE.md, types/CLAUDE.md
ls infra/lib                     # vs infra/CLAUDE.md (4 core stacks + opt-in Catalog)
ls app/*/page.tsx                # vs the page tree in AGENTS.md / README.md
grep -n '"version"' package.json # vs CLAUDE.md + README badge
```

Cross-check the facts that drift most often:

- ECS container env vars: `infra/lib/ecs-stack.ts` vs `README.md` / `AGENTS.md` / `.env.example`
- stack count and names: `infra/bin/app.ts` vs every doc that lists them
- data schema: `docs/kiro-user-activity-report-schema.md` is authoritative for columns
- known-issues sections: delete entries that no longer exist in code (for example
  there is no NextAuth and no `lib/auth.ts` — auth is Lambda@Edge only)

## 2. Update stale sections

- Add missing route/component/module entries
- Delete entries whose files are gone
- Correct descriptions whose behavior changed
- Keep steering files short; move long reference material into a skill or `docs/`

## 3. Report

Rate each doc and summarize what changed:

- **Complete** — every file listed, descriptions accurate
- **Partial** — some entries missing or stale
- **Stale** — significantly out of date

## Rules

- Never delete content that is still accurate
- Prefer the source tree over any doc when they disagree, and prefer the upstream
  Kiro docs over this repo for report schema and delivery cadence
- Doc-only changes are app-only for deploy purposes, but `CHANGELOG.md` is a
  required Docker build input — never exclude it
