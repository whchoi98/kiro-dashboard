# Refactor Skill

## Trigger

Use when the user asks to:
- "refactor this", "리팩토링 해줘"
- "clean up this code", "코드 정리"
- "extract this into a component/hook/function"
- `/refactor`

## Process

### 1. Understand Before Changing
- Read the target file(s) completely before proposing changes
- Identify all callers/consumers of the code being refactored
- Check if the symbol is exported and used across multiple files

### 2. Refactoring Targets for This Project

**Extract repeated Athena SQL patterns into helpers:**
- Common WHERE clauses for date ranges belong in `lib/athena.ts`
- Shared column aggregations can be extracted as SQL builder functions

**Extract repeated component patterns:**
- Repeated `MetricCard` groups → new composite component in `app/components/charts/`
- Repeated date-filtered API calls → custom hook in `app/hooks/` (create if needed)

**Reduce Client Component surface:**
- Move any data fetching logic from `'use client'` components to Server Components
- Pass pre-fetched data as props instead of fetching in client

**Type safety improvements:**
- Replace `Record<string, string>` from raw Athena rows with typed interfaces in `types/dashboard.ts`
- Add explicit return types to all API route handlers

### 3. Validation Steps

After refactoring:
```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build check
npm run build
```

### 4. Update Documentation

- If extracting a new shared utility to `lib/`, update `lib/CLAUDE.md`
- If creating/moving a component, update `app/components/CLAUDE.md`
- If changing an API route's response shape, update `app/api/CLAUDE.md` and `types/CLAUDE.md`

## Rules

- Never change external behavior — only internal structure
- Do not change TypeScript interfaces in `types/dashboard.ts` unless fixing type errors
- Run `npm run build` to verify no regressions before declaring done
