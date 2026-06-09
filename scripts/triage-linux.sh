#!/usr/bin/env bash
# scripts/triage-linux.sh — Linux cron wrapper for /km-triage
#
# Mirrors scripts/triage-windows.ps1: iterates the triage up to
# MAX_ITERATIONS times, re-sweeping when a sweep pushed auto-fix
# commits (so the new head gets reviewed in the same cron tick
# rather than waiting 30 min). Bounded loop so a buggy fix can't
# spin forever.
#
# Install (once):
#   crontab -e
#   */30 * * * * flock -n /tmp/km-triage.lock /path/to/keyboard-studio/scripts/triage-linux.sh
#
# The flock -n means: if another sweep is already running, this
# invocation exits immediately rather than queuing up.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

AUDIT_LOG=".tech-lead-inbox/audit-log.jsonl"
RUNS_DIR=".tech-lead-inbox/runs"
MAX_ITERATIONS=3
SLEEP_BETWEEN_SEC=45
LOOP_ON_ACTIONS="auto_fix_only fix_and_mention"

CLAUDE="${CLAUDE_BIN:-/home/lee2mr/.local/bin/claude}"

mkdir -p "$RUNS_DIR"

# Refresh main so the sweep sees the latest crew/command definitions.
git fetch origin main --quiet
git checkout main --quiet
git pull --ff-only --quiet

for i in $(seq 1 $MAX_ITERATIONS); do
    PRIOR_LINE_COUNT=0
    if [ -f "$AUDIT_LOG" ]; then
        PRIOR_LINE_COUNT=$(wc -l < "$AUDIT_LOG")
    fi

    STAMP=$(date -u +"%Y-%m-%d-%H%M")
    LOG="$RUNS_DIR/${STAMP}-iter${i}.log"

    export KM_TRIAGE_SWEEP_ID="${STAMP}-iter${i}"

    set +e
    "$CLAUDE" -p "/km-triage" --dangerously-skip-permissions --output-format text >> "$LOG" 2>&1
    EXIT_CODE=$?
    set -e
    unset KM_TRIAGE_SWEEP_ID

    if [ $EXIT_CODE -ne 0 ]; then
        echo "[WARN] iteration $i: claude exited with code $EXIT_CODE" >> "$LOG"
    fi

    # Check whether any new audit entries warrant a re-sweep.
    if [ ! -f "$AUDIT_LOG" ]; then
        break
    fi

    SHOULD_LOOP=false
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        ACTION=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('action_taken',''))" 2>/dev/null || true)
        for loop_action in $LOOP_ON_ACTIONS; do
            if [ "$ACTION" = "$loop_action" ]; then
                SHOULD_LOOP=true
                break 2
            fi
        done
    done < <(tail -n +"$((PRIOR_LINE_COUNT + 1))" "$AUDIT_LOG")

    if [ "$SHOULD_LOOP" = false ]; then
        break
    fi

    if [ "$i" -lt "$MAX_ITERATIONS" ]; then
        sleep "$SLEEP_BETWEEN_SEC"
    fi
done
