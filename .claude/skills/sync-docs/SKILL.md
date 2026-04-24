---
description: Sync Docs Skill — audits all module CLAUDE.md files against actual source and updates stale sections with quality scoring
---

# Sync Docs Skill

## Trigger

Use when the user asks to:
- "sync docs", "문서 동기화"
- "update CLAUDE.md files", "CLAUDE.md 업데이트"
- "docs are out of date", "문서가 오래됨"
- `/sync-docs`

## Process

### 1. Audit All Module CLAUDE.md Files

Check each module CLAUDE.md against actual source files:

```bash
# List all API endpoints vs app/api/CLAUDE.md
ls /home/ec2-user/my-project/kiro-dashboard/app/api/

# List all components vs app/components/CLAUDE.md
ls /home/ec2-user/my-project/kiro-dashboard/app/components/layout/
ls /home/ec2-user/my-project/kiro-dashboard/app/components/charts/
ls /home/ec2-user/my-project/kiro-dashboard/app/components/tables/
ls /home/ec2-user/my-project/kiro-dashboard/app/components/ui/

# List lib files vs lib/CLAUDE.md
ls /home/ec2-user/my-project/kiro-dashboard/lib/

# List TypeScript interfaces vs types/CLAUDE.md
ls /home/ec2-user/my-project/kiro-dashboard/types/

# List CDK stacks vs infra/CLAUDE.md
ls /home/ec2-user/my-project/kiro-dashboard/infra/lib/
```

### 2. Update Stale Sections

For each CLAUDE.md that is out of sync:
- Add missing endpoint/component/file entries
- Remove entries for deleted files
- Update descriptions if behavior changed

### 3. Update Root CLAUDE.md

Verify `CLAUDE.md` (root) reflects:
- Correct list of dashboard pages
- Current ECS env vars (cross-check with `infra/lib/ecs-stack.ts`)
- Correct key commands

### 4. Update docs/architecture.md

If the data flow or stack composition changed, update `docs/architecture.md`.

### 5. Quality Score

After syncing, rate each CLAUDE.md:
- **Complete** — all files listed, descriptions accurate
- **Partial** — some entries missing or stale
- **Stale** — significantly out of date

Report the scores and a summary of what was updated.

## Rules

- Never remove content from CLAUDE.md that is still accurate
- Add new entries; update changed entries; mark removed files as deleted
- Keep CLAUDE.md files concise — avoid duplicating content already in root CLAUDE.md
