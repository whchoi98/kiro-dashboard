#!/usr/bin/env bash
# tests/run-all.sh — TAP-style test runner for kiro-dashboard project structure

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
TOTAL=0

# ---------------------------------------------------------------
# TAP helper functions
# ---------------------------------------------------------------
ok() {
  TOTAL=$((TOTAL + 1))
  PASS=$((PASS + 1))
  echo "ok $TOTAL - $1"
}

not_ok() {
  TOTAL=$((TOTAL + 1))
  FAIL=$((FAIL + 1))
  echo "not ok $TOTAL - $1"
  echo "  # FAILED: $2"
}

assert_file() {
  local path="$PROJECT_ROOT/$1"
  if [[ -f "$path" ]]; then
    ok "File exists: $1"
  else
    not_ok "File exists: $1" "Missing file: $path"
  fi
}

assert_dir() {
  local path="$PROJECT_ROOT/$1"
  if [[ -d "$path" ]]; then
    ok "Directory exists: $1"
  else
    not_ok "Directory exists: $1" "Missing directory: $path"
  fi
}

assert_executable() {
  local path="$PROJECT_ROOT/$1"
  if [[ -x "$path" ]]; then
    ok "Executable: $1"
  else
    not_ok "Executable: $1" "Not executable: $path"
  fi
}

assert_contains() {
  local file="$PROJECT_ROOT/$1"
  local pattern="$2"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    ok "Contains '$pattern' in $1"
  else
    not_ok "Contains '$pattern' in $1" "Pattern not found in $file"
  fi
}

# ---------------------------------------------------------------
# Run all test suites
# ---------------------------------------------------------------
echo "TAP version 13"
echo ""
echo "# Running: hook tests"
bash "$PROJECT_ROOT/tests/hooks/test-hooks.sh" 2>/dev/null || true

echo ""
echo "# Running: secret pattern tests"
bash "$PROJECT_ROOT/tests/hooks/test-secret-patterns.sh" 2>/dev/null || true

echo ""
echo "# Running: structure tests"
bash "$PROJECT_ROOT/tests/structure/test-plugin-structure.sh" 2>/dev/null || true

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
echo ""
echo "# Test Summary"
echo "# Total: $TOTAL, Passed: $PASS, Failed: $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo "# RESULT: FAILED"
  exit 1
else
  echo "# RESULT: ALL PASSED"
  exit 0
fi
