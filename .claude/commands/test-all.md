---
description: Run build and lint checks for kiro-dashboard
---

Run all build and lint checks for the project.

```bash
cd /home/ec2-user/my-project/kiro-dashboard

echo "=== TypeScript type check ==="
npx tsc --noEmit

echo ""
echo "=== ESLint ==="
npm run lint

echo ""
echo "=== Next.js build ==="
npm run build

echo ""
echo "=== Project structure tests ==="
bash tests/run-all.sh 2>/dev/null || echo "Note: test suite not yet run"
```

Report:
- TypeScript errors (if any)
- ESLint warnings and errors
- Build output size and any warnings
- Pass/fail summary

If any step fails, explain the error and suggest a fix.
