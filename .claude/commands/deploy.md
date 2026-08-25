---
description: Deploy kiro-dashboard — delegates to the deploy skill (Path A/B, verification, rollback)
---

Deploy kiro-dashboard to AWS.

Follow `.claude/skills/deploy/SKILL.md` exactly — it holds the Path A
(image-only) vs Path B (CDK) decision rule, the real resource names (the ECS
service name is CDK-generated and must be looked up, never hardcoded), the
region trap (`--region ap-northeast-2` on every aws CLI call), the
verification checklist, and rollback.

For a version release (bump + changelog + deploy), use
`.claude/skills/release/SKILL.md` instead.

The authority for procedure detail and the full trap list (Traps 1-8) is
`docs/runbooks/production-deploy.md`.
