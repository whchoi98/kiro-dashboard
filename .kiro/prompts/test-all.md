---
description: Run the full verification gate — jest, type check, Next.js build, structure tests
---

# Verification gate

Run the project's real gate and report the result. `npm run lint` is **broken**
in this repo (no ESLint config — it drops into an interactive setup prompt), so
it is deliberately not part of this list.

```bash
cd /home/ec2-user/my-project/kiro-dashboard

echo "=== jest (the gate) ==="
npx jest

echo ""
echo "=== TypeScript type check ==="
npx tsc --noEmit

echo ""
echo "=== Next.js production build ==="
npm run build

echo ""
echo "=== Project structure + hook tests ==="
bash tests/run-all.sh
```

If the user passed arguments, narrow the run to them instead of the full sweep
(for example `npx jest $ARGUMENTS`): $ARGUMENTS

Report:

- jest: suites/tests passed vs failed, with the failing test names
- tsc: every error, file and line
- build: route table anomalies and any warning
- structure tests: which TAP assertions failed

If any step fails, explain the cause and propose the fix. Do not declare the
tree deployable unless jest and the build both pass.
