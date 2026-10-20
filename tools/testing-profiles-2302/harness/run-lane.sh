#!/usr/bin/env bash
# run-lane.sh <list-file> <lane-name> — sequential per-case driver runs.
set -u
cd "$(dirname "$0")/.."
LIST="$1"; LANE="$2"
while read -r id; do
  [ -z "$id" ] && continue
  echo "=== $id $(date -u +%H:%M:%S) lane=$LANE"
  node harness/run-case.mjs "$id" 2>&1 | tail -2
done < "$LIST"
echo "LANE $LANE DONE $(date -u +%H:%M:%S)"
