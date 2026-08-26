---
name: release-guide
description: Version release for kiro-dashboard — semver decision, the four synced version copies, bilingual CHANGELOG, test gate, release commit, then deploy with per-version ECR tags. Use for "릴리스", "release vX.Y.Z", "버전 올려줘".
---

# Release — kiro-dashboard

Requested version: $ARGUMENTS

A release = **version bump + changelog + test gate + commit**, then a deploy.
For a deploy without a version change, use `/cdk-deploy-guide` directly.

## Step 0 — decide the version

Semver against the unreleased changes since the newest `## [X.Y.Z]` heading in
`CHANGELOG.md`:

- new page/menu/feature → **minor** (1.12.0 → 1.13.0)
- fixes, docs, perf only → **patch** (1.12.0 → 1.12.1)

Confirm the number with the user if they did not state one.

## Step 1 — update the four synced copies

`tests/structure/version-sync.test.ts` enforces all four; run it and it names
whatever you missed.

1. **`package.json`** — `"version"`. `lib/version.ts` derives `APP_VERSION` from
   it; never hand-edit `lib/version.ts` or the sidebar.
2. **`CHANGELOG.md`** — insert `## [X.Y.Z] - YYYY-MM-DD` as the newest release
   heading in **both** sections (`# English` and `# 한국어`), moving
   `[Unreleased]` content into it.
   - Both sections must list the same versions in the same order.
   - **EN entries must contain zero Hangul** — `tests/lib/release-notes.test.ts`
     fails on a single Korean character in the English section ("2 AM local
     time", not "새벽 2시"). KO entries must contain Hangul.
   - Category headings stay English in both sections (Added / Changed / Fixed).
3. **`CLAUDE.md`** — the `**Version**: X.Y.Z` line, plus the project-structure
   tree if the release added a page.
4. **`README.md`** — the badge `version-X.Y.Z-purple`.

## Step 2 — test gate

```bash
npx jest tests/structure/version-sync.test.ts tests/lib/release-notes.test.ts
npx jest && npm run build      # full suite + production build
bash tests/run-all.sh          # structure + hook suites
```

`npm run lint` is broken (no ESLint config) — not part of the gate.

`/changelog` renders `CHANGELOG.md` at **build time**, so `.dockerignore` must
keep its `!CHANGELOG.md` re-include *after* the `*.md` exclusion — guarded by
`tests/structure/changelog-build-input.test.ts`. Do not touch it.

## Step 3 — commit

```bash
git add package.json CHANGELOG.md CLAUDE.md README.md
git commit -m "chore(release): vX.Y.Z — <one-line summary>"
```

Push only when the user asks ("푸시"). Never push to `main` unprompted.

## Step 4 — deploy

Follow `/cdk-deploy-guide` end to end (Path A vs Path B decision, verification,
rollback). Release-specific additions:

```bash
ECR=120443221648.dkr.ecr.ap-northeast-2.amazonaws.com
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:X.Y.Z"
docker push "$ECR/kiro-dashboard:X.Y.Z"
```

`latest` alone leaves a rollback with no named target — during the
v1.8.0 → v1.9.0 hop two distinct builds briefly claimed one version, and only
per-version/per-sha tags disambiguated them.

After verification, confirm the live version: the sidebar renders
`v{APP_VERSION}`, so a page fetched through the ALB with the `X-Custom-Secret`
header must contain `vX.Y.Z`.

## Step 5 — record

Report version, commit, image digest, ECR tags, and verification results. The
previous digest is the rollback anchor — write it down.
