#!/usr/bin/env bash
# test-triage-isolation-guard.sh
# Self-contained regression repro for the worktree-isolation post-condition.
# Proves that:
#   1. A clean tree passes the porcelain guard (exit 0, prints [OK]).
#   2. A stray untracked file fires the porcelain guard ([CRITICAL], exit 1).
#   3. A moved HEAD fires the HEAD-SHA guard ([CRITICAL], exit 1) —
#      exercised in a throwaway temp repo so the real working tree is never perturbed.
# Idempotent: cleans up the probe file and temp repo on exit.
set -euo pipefail

PROBE="packages/studio/src/__leak_probe.tmp"
REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
cd "$REPO_ROOT"

TMPDIR_REPO=""

cleanup() {
  rm -f "$PROBE"
  if [[ -n "$TMPDIR_REPO" ]]; then rm -rf "$TMPDIR_REPO"; fi
}
trap cleanup EXIT

# ── Helper: porcelain isolation check ───────────────────────────────────────
check_porcelain() {
  local snapshot="$1"
  local current
  current="$(git status --porcelain=v1 --untracked-files=all)"
  if [[ "$current" != "$snapshot" ]]; then
    echo "[CRITICAL] worktree isolation breach — main tree contaminated (stray index/untracked files)" >&2
    echo "  Diff:" >&2
    diff <(echo "$snapshot") <(echo "$current") | grep '^[<>]' | sed 's/^< /-/; s/^> /+/' >&2 || true
    return 1
  fi
  return 0
}

# ── Helper: HEAD-SHA isolation check ────────────────────────────────────────
check_head() {
  local snapshot_sha="$1"
  local current_sha="$2"
  if [[ "$current_sha" != "$snapshot_sha" ]]; then
    echo "[CRITICAL] worktree isolation breach — HEAD moved in main tree ($snapshot_sha -> $current_sha)" >&2
    return 1
  fi
  return 0
}

FAILURES=0

# ── Test 1: clean tree passes porcelain guard ────────────────────────────────
echo "--- Test 1: clean tree should pass porcelain guard"
SNAPSHOT="$(git status --porcelain=v1 --untracked-files=all)"
if check_porcelain "$SNAPSHOT"; then
  echo "[OK] Test 1 passed — clean tree correctly accepted"
else
  echo "[ERROR] Test 1 FAILED — clean tree was incorrectly rejected" >&2
  FAILURES=$((FAILURES + 1))
fi

# ── Test 2: stray untracked file fires porcelain guard ───────────────────────
echo "--- Test 2: stray untracked file should fire porcelain [CRITICAL]"
touch "$PROBE"
if check_porcelain "$SNAPSHOT"; then
  echo "[ERROR] Test 2 FAILED — stray file was NOT detected" >&2
  FAILURES=$((FAILURES + 1))
else
  echo "[OK] Test 2 passed — stray file correctly triggered [CRITICAL]"
fi
rm -f "$PROBE"

# ── Test 3: moved HEAD fires HEAD-SHA guard (hermetic temp repo) ─────────────
echo "--- Test 3: moved HEAD should fire HEAD-SHA [CRITICAL]"
TMPDIR_REPO="$(mktemp -d)"
git -C "$TMPDIR_REPO" init --quiet
git -C "$TMPDIR_REPO" config user.email "test@example.com"
git -C "$TMPDIR_REPO" config user.name "test"
echo "a" > "$TMPDIR_REPO/file.txt"
git -C "$TMPDIR_REPO" add file.txt
git -C "$TMPDIR_REPO" commit --quiet -m "first"
SHA_A="$(git -C "$TMPDIR_REPO" rev-parse HEAD)"
echo "b" >> "$TMPDIR_REPO/file.txt"
git -C "$TMPDIR_REPO" add file.txt
git -C "$TMPDIR_REPO" commit --quiet -m "second"
SHA_B="$(git -C "$TMPDIR_REPO" rev-parse HEAD)"
# SHA_A is the "sweep start" snapshot; SHA_B is what we see after fix-mode
if check_head "$SHA_A" "$SHA_B"; then
  echo "[ERROR] Test 3 FAILED — HEAD move was NOT detected" >&2
  FAILURES=$((FAILURES + 1))
else
  echo "[OK] Test 3 passed — HEAD move correctly triggered [CRITICAL]"
fi
rm -rf "$TMPDIR_REPO"; TMPDIR_REPO=""

echo "--- Summary: $FAILURES failure(s)"
exit "$FAILURES"
