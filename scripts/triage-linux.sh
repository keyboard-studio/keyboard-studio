#!/usr/bin/env bash
# scripts/triage-linux.sh — Linux cron wrapper for /km-triage
#
# Per-PR gate loop: all Phase 2 skip checks run in bash/jq before any
# claude invocation, so skipped PRs spend zero Claude credits.
# PRs that clear every gate each get a fresh, clean claude process —
# no accumulated context across unrelated PRs.
#
# !! SYNC WARNING !! These bash gates are a re-implementation of the Phase 2
# skip logic in .claude/commands/km-triage.md. The wrapper SHORT-CIRCUITS: a
# PR skipped here never spawns Claude, so a change to km-triage.md's Phase 2
# that is NOT mirrored here is silently a no-op for scheduled sweeps. They
# MUST be edited together. This bit us once (#479 broadened the review-needed
# re-review signal in km-triage.md only; the cron wrapper kept the old narrow
# @km-triage-owner rule and parked PRs forever on a plain reply / new commit).
# If you touch a gate below, update the matching km-triage.md section in the
# same commit, and vice-versa.
#
# The outer iteration loop is unchanged: a sweep that auto-fixed any PR
# re-sweeps (up to MAX_ITERATIONS) so the new head gets reviewed in the
# same cron tick rather than waiting 30 min.
#
# Install (once):
#   crontab -e
#   */30 * * * * flock -n /tmp/km-triage.lock /path/to/keyboard-studio/scripts/triage-linux.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

REPO="${KM_TRIAGE_REPO:-MattGyverLee/keyboard-studio}"
TL_EMAIL="${KM_TRIAGE_TL_EMAIL:-matthew_lee@sil.org}"
TL_LOGIN="${KM_TRIAGE_TL_LOGIN:-MattGyverLee}"
TRIAGE_OWNERS_JSON='["MattGyverLee","gboltono","coopabla","KevinPNG","dhigby","myczka"]'
CLAUDE="${CLAUDE_BIN:-/home/lee2mr/.local/bin/claude}"
# Server-track orchestrator model. Override with KM_TRIAGE_MODEL.
# Review specialists keep `model: sonnet` from their agent frontmatter; only
# the orchestrator is set here. Personal/interactive runs use sonnet by
# convention — see the Personal mode section in .claude/commands/km-triage.md.
MODEL="${KM_TRIAGE_MODEL:-opus}"

STATE_DIR=".escalations"
AUDIT_LOG="$STATE_DIR/audit-log.jsonl"
MAX_ITERATIONS=3
SLEEP_BETWEEN_SEC=45
LOOP_ON_ACTIONS="auto_fix_only fix_and_mention"

# ── Helpers ──────────────────────────────────────────────────────────────────

ts() { date -u +%FT%TZ; }

emit() { node utilities/km-triage-app/progress-emit.js "$@" 2>/dev/null || true; }

audit_skip() {
  local num="$1" reason="$2" head_sha="$3"
  printf '{"ts":"%s","pr":%s,"action_taken":"skipped","reason":"%s","head_sha":"%s","sweep_id":"%s"}\n' \
    "$(ts)" "$num" "$reason" "$head_sha" "$SWEEP_ID" >> "$AUDIT_LOG"
  emit "phase=pr-skip" "pr=$num" "reason=$reason" || true
  emit "phase=pr-end" "pr=$num" "action_taken=skipped" "head_sha=$head_sha" || true
}

# Returns the most recent substantive audit entry for a PR as a JSON object,
# or empty string if none exists. "Substantive" = crew actually ran.
last_audit_entry() {
  local num="$1"
  [[ -f "$AUDIT_LOG" ]] || { echo ""; return; }
  jq -c --argjson num "$num" \
    'select(.pr == $num and (.action_taken | IN(
       "approve_park","auto_fix_only","mention_only",
       "fix_and_mention","escalate","auto_fix_attempt_failed"
     )))' \
    "$AUDIT_LOG" 2>/dev/null | tail -1 || echo ""
}

# Posts a CONFLICTING merge-state notice via bot-gh, logs the skip, and
# increments n_skip.  $1=pr_num  $2=author_login  $3=head_sha
post_conflict_notice() {
  local pr_num="$1" author_login="$2" head_sha="$3"
  local mention_line f
  if [[ "$author_login" == "$TL_LOGIN" ]]; then
    mention_line="@$TL_LOGIN — km-triage skipped this PR."
  else
    mention_line="@$TL_LOGIN @$author_login — km-triage skipped this PR."
  fi
  f=$(mktemp)
  printf '%s\n\nPR is in CONFLICTING merge state. Triage policy is not to auto-fix or review a branch that needs rebasing.\n\nPlease rebase against `main` first; the next sweep will run the full review crew and either auto-fix mechanical findings or @-mention you again with any open questions.\n' \
    "$mention_line" > "$f"
  node utilities/km-triage-app/bot-gh.js pr comment "$pr_num" \
    --body-file "$f" >> "$LOG" 2>&1 || true
  rm -f "$f"
  audit_skip "$pr_num" merge_conflict "$head_sha"
  n_skip=$((n_skip + 1))
}

# Just-in-time draft re-check. The bulk `gh pr list` snapshot is taken once at
# the top of the iteration, but PRs are reviewed sequentially with a full,
# minutes-long claude run between each — so by the time a given PR's turn
# arrives the snapshot can be many minutes stale. A PR converted to draft
# inside that window would pass the stale Gate 2 and spin up an entire claude
# process only for its own Phase 2 to skip it as draft (wasted credits).
# Re-fetch live isDraft immediately before spawning. Returns 0 (and logs +
# audits the skip, bumping n_skip) when the PR is now a draft; 1 otherwise.
jit_is_draft() {
  local num="$1" head_sha="$2" live_draft
  live_draft=$(gh pr view "$num" --json isDraft --jq '.isDraft' 2>/dev/null || echo "")
  if [[ "$live_draft" == "true" ]]; then
    echo "  skip: draft (converted since sweep snapshot)" | tee -a "$LOG"
    audit_skip "$num" draft "$head_sha"
    n_skip=$((n_skip + 1))
    return 0
  fi
  return 1
}

spawn_claude_for_pr() {
  local pr_num="$1"
  set +e
  # stdin from /dev/null: claude -p reads stdin when it isn't a TTY. Inside the
  # per-PR while-read loop that would drain the jq stream of remaining PRs and
  # feed the wrong PR's JSON to this process. Keep it deaf to the loop's stdin.
  CLAUDECODE="" "$CLAUDE" -p "/km-triage $pr_num" --dangerously-skip-permissions --output-format text \
    < /dev/null >> "$LOG" 2>&1
  local exit_code=$?
  set -e
  if [[ "$exit_code" -ne 0 ]]; then
    echo "  [WARN] claude exited $exit_code for PR #$pr_num" | tee -a "$LOG"
  fi
}

# Returns the id of the most recent human (non-[bot]) comment posted after
# since_ts, or empty string. This is the generalized re-review signal from
# km-triage.md #479: ANY non-bot comment counts — no @km-triage string and no
# TRIAGE_OWNERS membership required (a submitter who pushes a fix and explains
# it in a plain reply is the natural response to an escalation and cannot be
# expected to know the @km-triage incantation). The `[bot]`-login exclusion is
# load-bearing: it filters the bot's own MENTION/ESCALATE comment and CI bots
# (vercel[bot]) so a sweep never re-triggers itself. The narrower
# @km-triage-from-TRIAGE_OWNERS "lead-trigger comment" survives only as a
# recognized subtype for audit attribution ($TRIAGE_OWNERS_JSON is retained
# for that) — it is no longer required to drive a re-review here.
#
# NB: pipe into real `jq` — `gh api --jq` does NOT accept --arg (it errors
# "unknown flag"), which silently returned empty and left every review-needed
# PR parked even after a reply.
find_human_comment() {
  local num="$1" since_ts="$2"
  [[ -z "$since_ts" ]] && { echo ""; return; }
  gh api "repos/$REPO/issues/$num/comments" 2>/dev/null \
    | jq -r --arg ts "$since_ts" \
      '[.[] | select(.created_at > $ts)
             | select(.user.login | endswith("[bot]") | not)]
       | last | .id // empty' 2>/dev/null || echo ""
}

# ── Phase 1: Bootstrap (once per cron tick) ──────────────────────────────────

mkdir -p "$STATE_DIR/runs" "$STATE_DIR/diffs" "$STATE_DIR/worktrees"

touch -a "$AUDIT_LOG"

# Triage labels: create once per repo lifetime, guarded by a sentinel file.
# Bump the sentinel suffix whenever a label is added so existing installs
# create the newcomer on their next sweep (then go quiet again).
if [[ ! -f "$STATE_DIR/.labels-created-v2" ]]; then
  gh label create ready-to-merge --color 0e8a16 \
    --description "Triage approved - ready to merge by any team member" 2>/dev/null || true
  gh label create review-needed --color d93f0b \
    --description "Triage escalated - awaiting submitter or maintainer response on the PR" 2>/dev/null || true
  gh label create triage-skip --color cfd3d7 \
    --description "Do not run triage on this PR" 2>/dev/null || true
  gh label create needs-rebase --color fbca04 \
    --description "Triage: branch conflicts with base - rebase needed (auto-clears once mergeable)" 2>/dev/null || true
  touch "$STATE_DIR/.labels-created-v2"
fi

if ! node utilities/km-triage-app/mint-token.js > /dev/null 2>&1; then
  printf '{"ts":"%s","action_taken":"auth_failed","reason":"bot_token_unavailable"}\n' \
    "$(ts)" >> "$AUDIT_LOG"
  echo "[$(ts)] km-triage bot-token mint failed; run \`node utilities/km-triage-app/setup.js\` to reinstall." >&2
  echo "[ERROR] bot-token unavailable — aborting" >&2
  exit 1
fi

# Refresh main so each claude call sees the latest crew/command definitions.
# Stash any local changes so the pull can proceed; restore them after.
git fetch origin main --quiet
git checkout main --quiet
STASH_OUTPUT=$(git stash --include-untracked 2>&1)
git pull --ff-only --quiet
[[ "$STASH_OUTPUT" != "No local changes to save" ]] && git stash pop --quiet || true

# ── Iteration loop ────────────────────────────────────────────────────────────

for i in $(seq 1 "$MAX_ITERATIONS"); do
  PRIOR_LINE_COUNT=0
  [[ -f "$AUDIT_LOG" ]] && PRIOR_LINE_COUNT=$(wc -l < "$AUDIT_LOG")

  STAMP=$(date -u +"%Y-%m-%d-%H%M")
  SWEEP_ID="${STAMP}-iter${i}"
  export KM_TRIAGE_SWEEP_ID="$SWEEP_ID"
  LOG="$STATE_DIR/runs/${STAMP}-iter${i}.log"

  echo "[km-triage] $SWEEP_ID starting" | tee -a "$LOG"

  # ── Discover all open PRs (one API call per iteration) ────────────────────

  # commits is omitted here — it blows the GraphQL node limit at --limit 50.
  # HEAD SHA comes from headRefOid; commit authors are fetched per-PR lazily in Gate 7.
  PRS_JSON=$(gh pr list \
    --state open \
    --json number,title,author,headRefName,headRefOid,baseRefName,labels,isDraft,mergeable,mergeStateStatus,statusCheckRollup,reviewDecision,isCrossRepository,headRepositoryOwner \
    --limit 50 | jq 'sort_by(.number)')

  TOTAL=$(echo "$PRS_JSON" | jq 'length')
  PR_NUMS=$(echo "$PRS_JSON" | jq -r '[.[].number] | map(tostring) | join(",")')
  echo "[km-triage] $TOTAL open PRs: [$PR_NUMS]" | tee -a "$LOG"
  emit "phase=sweep-start" "total_prs=$TOTAL" "prs=[$PR_NUMS]" || true

  n_skip=0
  n_review=0
  prs_to_retry=()

  # ── Per-PR gate loop ──────────────────────────────────────────────────────
  # Gates mirror km-triage Phase 2 exactly.  Any PR that passes all gates
  # gets a fresh claude -p "/km-triage $NUM" with no prior-PR context.

  # Read PR records on fd 3, not stdin, so any subprocess spawned in the loop
  # body (notably claude -p) cannot consume the stream and truncate the sweep.
  while IFS= read -r PR <&3; do
    NUM=$(echo "$PR" | jq -r '.number')
    TITLE=$(echo "$PR" | jq -r '.title')
    HEAD_SHA=$(echo "$PR" | jq -r '.headRefOid // "unknown"')
    AUTHOR=$(echo "$PR" | jq -r '.author.login')
    TRIGGER_COMMENT_ID=""   # populated lazily; reset each PR

    printf '[km-triage] PR #%s: %s\n' "$NUM" "$TITLE" | tee -a "$LOG"

    # Label hygiene — clear stale needs-rebase (the "go away when done" half).
    # Runs first, before any gate's `continue`, so the tag clears even when the
    # PR is then skipped for an unrelated reason (e.g. ci_not_ready). A PR that
    # is still CONFLICTING keeps the tag (Gate 4 re-adds / leaves it).
    if echo "$PR" | jq -e '.mergeable != "CONFLICTING"' > /dev/null 2>&1 \
       && echo "$PR" | jq -e '[.labels[].name] | any(. == "needs-rebase")' > /dev/null 2>&1; then
      echo "  clearing stale needs-rebase (mergeable again)" | tee -a "$LOG"
      node utilities/km-triage-app/bot-gh.js api \
        "repos/$REPO/issues/$NUM/labels/needs-rebase" -X DELETE >> "$LOG" 2>&1 || true
    fi

    # Gate 1 — external fork
    if echo "$PR" | jq -e '.isCrossRepository == true' > /dev/null 2>&1; then
      echo "  skip: external_pr_not_in_scope" | tee -a "$LOG"
      audit_skip "$NUM" external_pr_not_in_scope "$HEAD_SHA"
      n_skip=$((n_skip + 1)); continue
    fi

    # Gate 2 — draft
    if echo "$PR" | jq -e '.isDraft == true' > /dev/null 2>&1; then
      echo "  skip: draft" | tee -a "$LOG"
      audit_skip "$NUM" draft "$HEAD_SHA"
      n_skip=$((n_skip + 1)); continue
    fi

    # Gate 3 — hard-skip labels (ready-to-merge, triage-skip)
    if echo "$PR" | jq -e '[.labels[].name] | any(. == "ready-to-merge" or . == "triage-skip")' > /dev/null 2>&1; then
      echo "  skip: already_awaiting_response (label)" | tee -a "$LOG"
      audit_skip "$NUM" already_awaiting_response "$HEAD_SHA"
      n_skip=$((n_skip + 1)); continue
    fi

    # Gate 4 — CONFLICTING: flag with the needs-rebase tag, then skip silently.
    # Dedup is by label presence (not head SHA): first sweep to see the conflict
    # adds the tag + posts one @-mention notice; while the tag persists the PR is
    # skipped quietly. The label-hygiene block above removes the tag once the
    # branch is mergeable again, so the notice posts exactly once per conflict.
    if echo "$PR" | jq -e '.mergeable == "CONFLICTING"' > /dev/null 2>&1; then
      if echo "$PR" | jq -e '[.labels[].name] | any(. == "needs-rebase")' > /dev/null 2>&1; then
        echo "  skip: merge_conflict (already tagged needs-rebase)" | tee -a "$LOG"
      else
        echo "  skip: merge_conflict — tagging needs-rebase + posting notice" | tee -a "$LOG"
        node utilities/km-triage-app/bot-gh.js api \
          "repos/$REPO/issues/$NUM/labels" -X POST -f "labels[]=needs-rebase" >> "$LOG" 2>&1 || true
        CONFLICT_FILE=$(mktemp)
        if [[ "$AUTHOR" == "$TL_LOGIN" ]]; then
          MENTION_LINE="@$TL_LOGIN — km-triage skipped this PR."
        else
          MENTION_LINE="@$TL_LOGIN @$AUTHOR — km-triage skipped this PR."
        fi
        printf '%s\n\nPR is in CONFLICTING merge state. Triage policy is not to auto-fix or review a branch that needs rebasing.\n\nPlease rebase against `main` first; the next sweep will run the full review crew and either auto-fix mechanical findings or @-mention you again with any open questions. The `needs-rebase` label clears automatically once the branch is mergeable again.\n' \
          "$MENTION_LINE" > "$CONFLICT_FILE"
        node utilities/km-triage-app/bot-gh.js pr comment "$NUM" \
          --body-file "$CONFLICT_FILE" >> "$LOG" 2>&1 || true
        rm -f "$CONFLICT_FILE"
      fi
      audit_skip "$NUM" merge_conflict "$HEAD_SHA"
      n_skip=$((n_skip + 1)); continue
    fi

    # Gate 5 — mergeability unknown: defer to end of sweep rather than next cron tick.
    # GitHub computes mergeability async; by the time all other PRs are processed
    # it will usually have resolved to MERGEABLE or CONFLICTING.
    if echo "$PR" | jq -e '.mergeable == "UNKNOWN"' > /dev/null 2>&1; then
      echo "  deferred: mergeability_unknown (will retry after other PRs)" | tee -a "$LOG"
      prs_to_retry+=("$NUM")
      continue
    fi

    # Gate 6 — CI blocking (any required check not SUCCESS/NEUTRAL/SKIPPED)
    CI_BLOCKING=$(echo "$PR" | jq '
      .statusCheckRollup // [] |
      map(select(.isRequired == true)) |
      map(select(
        if .__typename == "CheckRun" then
          (.conclusion // .status // "") | IN("SUCCESS","NEUTRAL","SKIPPED") | not
        else
          (.state // "") | IN("SUCCESS") | not
        end
      )) | length')
    if [[ "$CI_BLOCKING" -gt 0 ]]; then
      echo "  skip: ci_not_ready ($CI_BLOCKING blocking)" | tee -a "$LOG"
      audit_skip "$NUM" ci_not_ready "$HEAD_SHA"
      n_skip=$((n_skip + 1)); continue
    fi

    # Gate 7 — solo tech-lead authorship (lazy commits fetch — not in bulk query)
    PR_COMMITS=$(gh pr view "$NUM" --json commits --jq '.commits' 2>/dev/null || echo "[]")
    COMMIT_COUNT=$(echo "$PR_COMMITS" | jq 'length')
    if [[ "$COMMIT_COUNT" -gt 0 ]]; then
      NON_TL=$(echo "$PR_COMMITS" | jq --arg tl "$TL_EMAIL" \
        '[.[].authors[].email] | unique | map(select(. != $tl)) | length')
      if [[ "$NON_TL" -eq 0 ]]; then
        echo "  skip: solo_tech_lead_author" | tee -a "$LOG"
        audit_skip "$NUM" solo_tech_lead_author "$HEAD_SHA"
        n_skip=$((n_skip + 1)); continue
      fi
    fi

    # Gates 8+9 share the last audit entry — read once per PR
    LAST_ENTRY=$(last_audit_entry "$NUM")
    LAST_AUDIT_TS=$(echo "$LAST_ENTRY" | jq -r '.ts // empty' 2>/dev/null || echo "")
    LAST_AUDIT_SHA=$(echo "$LAST_ENTRY" | jq -r '.head_sha // empty' 2>/dev/null || echo "")
    LAST_AUDIT_ACTION=$(echo "$LAST_ENTRY" | jq -r '.action_taken // empty' 2>/dev/null || echo "")

    # Gate 8 — review-needed label: skip unless a re-review signal exists.
    # Per km-triage.md #479 the signal is EITHER of:
    #   (a) a new commit by someone other than the bot — current HEAD differs
    #       from the last review's head_sha AND the head commit's author login
    #       is not km-triage[bot] (so the bot's own auto-fix push never counts);
    #   (b) any human (non-[bot]) comment since the last review (find_human_comment).
    # The pre-#479 gate looked ONLY for a TRIAGE_OWNERS @km-triage comment and
    # ignored HEAD entirely, so a submitter who pushed fixes and explained them
    # in a plain reply was parked forever. Keep this in lockstep with the
    # review-needed gate in km-triage.md Phase 2 (see the sync warning above).
    if echo "$PR" | jq -e '[.labels[].name] | any(. == "review-needed")' > /dev/null 2>&1; then
      HEAD_AUTHOR=$(echo "$PR_COMMITS" | jq -r '.[-1].authors[0].login // ""')
      NEW_COMMIT_SIGNAL=false
      if [[ -n "$LAST_AUDIT_SHA" && "$HEAD_SHA" != "$LAST_AUDIT_SHA" \
            && "$HEAD_AUTHOR" != "km-triage[bot]" ]]; then
        NEW_COMMIT_SIGNAL=true
      fi
      TRIGGER_COMMENT_ID=$(find_human_comment "$NUM" "$LAST_AUDIT_TS")
      if [[ "$NEW_COMMIT_SIGNAL" == false && -z "$TRIGGER_COMMENT_ID" ]]; then
        echo "  skip: already_awaiting_response (review-needed, no re-review signal)" | tee -a "$LOG"
        audit_skip "$NUM" already_awaiting_response "$HEAD_SHA"
        n_skip=$((n_skip + 1)); continue
      else
        if [[ "$NEW_COMMIT_SIGNAL" == true ]]; then
          echo "  re-review signal: new commit ${HEAD_SHA:0:9} by $HEAD_AUTHOR — removing review-needed" | tee -a "$LOG"
        else
          echo "  re-review signal: human comment #$TRIGGER_COMMENT_ID — removing review-needed" | tee -a "$LOG"
        fi
        node utilities/km-triage-app/bot-gh.js api \
          "repos/$REPO/issues/$NUM/labels/review-needed" \
          -X DELETE >> "$LOG" 2>&1 || true
        # fall through — Claude handles the re-review
      fi
    fi

    # Gate 9 — same head SHA as last review + no trigger comment
    # Exception: auto_fix_only + unchanged SHA means the push silently failed;
    # log a warning and re-run rather than skipping.
    if [[ -n "$LAST_AUDIT_SHA" && "$LAST_AUDIT_SHA" == "$HEAD_SHA" ]]; then
      if [[ "$LAST_AUDIT_ACTION" == "auto_fix_only" ]]; then
        echo "  [WARN] auto_fix_push_unverified — re-running review" | tee -a "$LOG"
        printf '[%s] PR #%s: auto_fix_only recorded but head SHA unchanged — re-running\n' \
          "$(ts)" "$NUM" | tee -a "$LOG"
        # fall through to Claude
      else
        # Reuse human-comment check from Gate 8 if already fetched; else fetch now
        if [[ -z "$TRIGGER_COMMENT_ID" ]]; then
          TRIGGER_COMMENT_ID=$(find_human_comment "$NUM" "$LAST_AUDIT_TS")
        fi
        if [[ -z "$TRIGGER_COMMENT_ID" ]]; then
          echo "  skip: no_new_commits_since_last_review" | tee -a "$LOG"
          audit_skip "$NUM" no_new_commits_since_last_review "$HEAD_SHA"
          n_skip=$((n_skip + 1)); continue
        fi
        # Has trigger comment — fall through to Claude
      fi
    fi

    # All gates cleared — but the Phase-2 snapshot may be stale by now (this PR
    # may have sat behind other PRs' multi-minute claude runs). Re-check draft
    # live so a just-converted draft never spins up a claude process.
    if jit_is_draft "$NUM" "$HEAD_SHA"; then continue; fi

    # Spawn a fresh, isolated Claude process for this PR
    echo "  -> spawning claude for PR #$NUM" | tee -a "$LOG"
    n_review=$((n_review + 1))
    set +e
    # stdin from /dev/null — see spawn_claude_for_pr: prevents claude from
    # draining the loop's PR stream (fd 3) and being fed the next PR's JSON.
    CLAUDECODE="" "$CLAUDE" -p "/km-triage $NUM" --model "$MODEL" --dangerously-skip-permissions --output-format text \
      < /dev/null >> "$LOG" 2>&1
    CLAUDE_EXIT=$?
    set -e
    if [[ "$CLAUDE_EXIT" -ne 0 ]]; then
      echo "  [WARN] claude exited $CLAUDE_EXIT for PR #$NUM" | tee -a "$LOG"
    fi

  done 3< <(echo "$PRS_JSON" | jq -c '.[]')

  # ── Retry deferred UNKNOWN-mergeability PRs ──────────────────────────────
  # Processing the other PRs buys enough time for GitHub to resolve mergeability.
  if [[ ${#prs_to_retry[@]} -gt 0 ]]; then
    echo "[km-triage] retrying ${#prs_to_retry[@]} UNKNOWN-mergeability PR(s)" | tee -a "$LOG"
    for RETRY_NUM in "${prs_to_retry[@]}"; do
      RETRY_PR=$(gh pr view "$RETRY_NUM" \
        --json number,mergeable,headRefOid,author,isDraft 2>/dev/null || echo "{}")
      RETRY_MERGEABLE=$(echo "$RETRY_PR" | jq -r '.mergeable // "UNKNOWN"')
      RETRY_HEAD=$(echo "$RETRY_PR" | jq -r '.headRefOid // "unknown"')
      RETRY_AUTHOR=$(echo "$RETRY_PR" | jq -r '.author.login // "unknown"')
      RETRY_STATE=$(echo "$RETRY_PR" | jq -r '.state // "CLOSED"')
      if [[ "$RETRY_STATE" != "OPEN" ]]; then
        printf '  PR #%s no longer open (%s) — skipping\n' "$RETRY_NUM" "$RETRY_STATE" | tee -a "$LOG"
        n_skip=$((n_skip + 1))
        continue
      fi

      printf '  [retry] PR #%s\n' "$RETRY_NUM" | tee -a "$LOG"

      if [[ "$RETRY_MERGEABLE" == "UNKNOWN" ]]; then
        echo "  PR #$RETRY_NUM still UNKNOWN — skipping until next sweep" | tee -a "$LOG"
        audit_skip "$RETRY_NUM" mergeability_unknown "$RETRY_HEAD"
        n_skip=$((n_skip + 1))

      elif [[ "$RETRY_MERGEABLE" == "CONFLICTING" ]]; then
        echo "  PR #$RETRY_NUM resolved CONFLICTING — posting notice" | tee -a "$LOG"
        post_conflict_notice "$RETRY_NUM" "$RETRY_AUTHOR" "$RETRY_HEAD"

      elif [[ "$(echo "$RETRY_PR" | jq -r '.isDraft // false')" == "true" ]]; then
        # Converted to draft while we were processing the other PRs.
        echo "  PR #$RETRY_NUM converted to draft — skipping" | tee -a "$LOG"
        audit_skip "$RETRY_NUM" draft "$RETRY_HEAD"
        n_skip=$((n_skip + 1))

      else
        # Resolved to MERGEABLE — spawn Claude for full review
        echo "  PR #$RETRY_NUM resolved $RETRY_MERGEABLE — spawning claude" | tee -a "$LOG"
        n_review=$((n_review + 1))
        spawn_claude_for_pr "$RETRY_NUM"
      fi
    done
  fi

  echo "[km-triage] iteration $i: $n_review reviewed, $n_skip skipped" | tee -a "$LOG"
  unset KM_TRIAGE_SWEEP_ID

  # ── Decide whether to re-sweep (same logic as before) ────────────────────
  # Re-sweep if any action moved a head SHA (auto_fix_only, fix_and_mention)
  # so the updated head gets reviewed in the same cron tick.

  [[ -f "$AUDIT_LOG" ]] || break
  SHOULD_LOOP=false
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    ACTION=$(echo "$line" | jq -r '.action_taken // empty' 2>/dev/null || true)
    for loop_action in $LOOP_ON_ACTIONS; do
      if [[ "$ACTION" == "$loop_action" ]]; then
        SHOULD_LOOP=true
        break 2
      fi
    done
  done < <(tail -n +"$((PRIOR_LINE_COUNT + 1))" "$AUDIT_LOG")

  [[ "$SHOULD_LOOP" == false ]] && break
  [[ "$i" -lt "$MAX_ITERATIONS" ]] && sleep "$SLEEP_BETWEEN_SEC"

done
