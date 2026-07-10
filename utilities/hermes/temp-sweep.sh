#!/usr/bin/env bash
# temp-sweep.sh — reason-temperature sweep for the Hermes simplifier vetting.
#
# Runs vet.mjs Scorecard A (30-gold slice, --samples 5) at each reason temperature
# for devstral-small-2 + gpt-oss:20b, snapshotting each temp's scorecard so the run
# is self-describing. Scorecard B (judge) re-runs each temp — it's temp-independent
# waste, but there is no flag to skip it. Report-only; no source writes, no GitHub.
#
# Usage:   bash utilities/hermes/temp-sweep.sh
# Output:  utilities/hermes/reports/vet/sweep/scorecard-t<temp>.{md,json}
#          utilities/hermes/reports/vet/sweep/sweep.log   (full stdout of every run)
#
# Safe to re-run: snapshots are overwritten per temp. Ctrl-C between temps is fine;
# already-snapshotted temps are kept.

set -uo pipefail

# --- config ---
TEMPS=(0.1 0.3 0.5 0.7)
MODELS="devstral-small-2,gpt-oss:20b"
SAMPLES=5
ENDPOINT="http://localhost:11434/api/tags"

# --- resolve paths (script lives in utilities/hermes) ---
HERMES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERMES_DIR/../.." && pwd)"
VET="$HERMES_DIR/vet.mjs"
SWEEP_DIR="$HERMES_DIR/reports/vet/sweep"
SCORECARD_MD="$HERMES_DIR/reports/vet/scorecard.md"
SCORECARD_JSON="$HERMES_DIR/reports/vet/scorecard.json"
LOG="$SWEEP_DIR/sweep.log"

mkdir -p "$SWEEP_DIR"
: > "$LOG"

# --- preflight ---
if ! curl -s -m 5 "$ENDPOINT" >/dev/null 2>&1; then
  echo "[ERROR] Ollama not reachable at $ENDPOINT — start it first." | tee -a "$LOG"
  exit 1
fi
echo "[OK] Ollama up. Sweeping temps: ${TEMPS[*]} | models: $MODELS | samples: $SAMPLES" | tee -a "$LOG"
echo "[OK] Snapshots -> $SWEEP_DIR" | tee -a "$LOG"
START_ALL=$(date +%s)

# --- sweep ---
for t in "${TEMPS[@]}"; do
  echo "" | tee -a "$LOG"
  echo "=== reason-temp $t — $(date '+%H:%M:%S') ===" | tee -a "$LOG"
  START=$(date +%s)

  node "$VET" --only "$MODELS" --reason-temp "$t" --samples "$SAMPLES" 2>&1 | tee -a "$LOG"
  rc=${PIPESTATUS[0]}

  if [[ $rc -ne 0 ]]; then
    echo "[WARN] vet.mjs exited $rc for temp $t — snapshotting whatever it wrote and continuing." | tee -a "$LOG"
  fi

  [[ -f "$SCORECARD_MD"   ]] && cp "$SCORECARD_MD"   "$SWEEP_DIR/scorecard-t${t}.md"
  [[ -f "$SCORECARD_JSON" ]] && cp "$SCORECARD_JSON" "$SWEEP_DIR/scorecard-t${t}.json"

  ELAPSED=$(( $(date +%s) - START ))
  echo "[OK] temp $t done in $((ELAPSED / 60))m$((ELAPSED % 60))s -> scorecard-t${t}.md" | tee -a "$LOG"
done

# --- summary: pull the Scorecard A model rows from each snapshot ---
echo "" | tee -a "$LOG"
echo "======== SWEEP SUMMARY (Scorecard A rows per temp) ========" | tee -a "$LOG"
for t in "${TEMPS[@]}"; do
  f="$SWEEP_DIR/scorecard-t${t}.md"
  echo "" | tee -a "$LOG"
  echo "--- temp $t ---" | tee -a "$LOG"
  if [[ -f "$f" ]]; then
    grep -E "devstral-small-2|gpt-oss:20b" "$f" | tee -a "$LOG"
  else
    echo "  (no scorecard — run failed)" | tee -a "$LOG"
  fi
done

TOTAL=$(( $(date +%s) - START_ALL ))
echo "" | tee -a "$LOG"
echo "[OK] Sweep complete in $((TOTAL / 60))m$((TOTAL % 60))s. Compare recall_strict / extras across temps above." | tee -a "$LOG"
echo "[OK] Full log: $LOG"
echo "[OK] Snapshots: $SWEEP_DIR/scorecard-t*.md"
