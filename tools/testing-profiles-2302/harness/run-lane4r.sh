#!/bin/bash
# run-lane4r.sh <list-file> <lane-name> — like run-lane4.sh but retries a case
# until its case-result.json exists with no driverNote (transient EPERM
# write-denials seen on 2026-11-03 come in minutes-long bursts).
set -u
cd "$(dirname "$0")/.."
LIST="$1"; LANE="$2"
while read -r id; do
  [ -z "$id" ] && continue
  F="evidence/$id/case-result.json"
  if [ -f "$F" ] && ! grep -q '"driverNote": "[^"]' "$F" 2>/dev/null; then
    echo "=== $id lane=$LANE already complete; skipping"; continue
  fi
  attempt=0
  while true; do
    attempt=$((attempt+1))
    echo "=== $id $(date -u +%H:%M:%S) lane=$LANE attempt=$attempt"
    node harness/run-case4.mjs "$id" 2>&1 | tail -2
    if [ -f "$F" ] && ! grep -q '"driverNote": "[^"]' "$F" 2>/dev/null; then
      echo "--- $id ok after attempt $attempt"; break
    fi
    echo "--- $id attempt $attempt produced no result; backing off 60s"
    sleep 60
  done
done < "$LIST"
echo "LANE $LANE DONE $(date -u +%H:%M:%S)"
