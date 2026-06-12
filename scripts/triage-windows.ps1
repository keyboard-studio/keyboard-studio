# scripts/triage-windows.ps1 - run /km-triage from Task Scheduler
#
# Per-PR gate loop: all Phase 2 skip checks run in PowerShell/jq before
# any claude invocation, so skipped PRs spend zero Claude credits.
# PRs that clear every gate each get a fresh, clean claude process -
# no accumulated context across unrelated PRs.
#
# The outer iteration loop is unchanged: a sweep that auto-fixed any PR
# re-sweeps (up to $maxIterations) so the new head gets reviewed in the
# same Task Scheduler tick rather than waiting 30 min.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)

$repo             = if ($env:KM_TRIAGE_REPO)    { $env:KM_TRIAGE_REPO }    else { "MattGyverLee/keyboard-studio" }
$tlEmail          = if ($env:KM_TRIAGE_TL_EMAIL) { $env:KM_TRIAGE_TL_EMAIL } else { "matthew_lee@sil.org" }
$tlLogin          = if ($env:KM_TRIAGE_TL_LOGIN) { $env:KM_TRIAGE_TL_LOGIN } else { "MattGyverLee" }
$triageOwners     = @("MattGyverLee","gboltono","coopabla","KevinPNG","dhigby","myczka")

$inboxDir         = ".tech-lead-inbox"
$auditLog         = "$inboxDir\audit-log.jsonl"
$maxIterations    = 3
$sleepBetweenSec  = 45
$loopOnActions    = @("auto_fix_only","fix_and_mention")

# Resolve the claude binary up front so Task Scheduler's restricted PATH gets an
# absolute path baked in. Override with $env:CLAUDE_BIN; fall back to bare "claude".
$claude = if ($env:CLAUDE_BIN) { $env:CLAUDE_BIN }
          elseif (Get-Command claude -ErrorAction SilentlyContinue) { (Get-Command claude).Source }
          else { "claude" }

# Model the spawned triage runs on. Override with $env:KM_TRIAGE_MODEL.
$model = if ($env:KM_TRIAGE_MODEL) { $env:KM_TRIAGE_MODEL } else { "haiku" }

# ── Helpers ───────────────────────────────────────────────────────────────────

function Get-Ts { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") }

function Write-AuditSkip {
  param($num, $reason, $headSha)
  $ts = Get-Ts
  $line = '{"ts":"{0}","pr":{1},"action_taken":"skipped","reason":"{2}","head_sha":"{3}","sweep_id":"{4}"}' `
    -f $ts, $num, $reason, $headSha, $env:KM_TRIAGE_SWEEP_ID
  Add-Content -Path $auditLog -Value $line
  try { node utilities/km-triage-app/progress-emit.js "phase=pr-skip" "pr=$num" "reason=$reason" 2>$null } catch {}
  try { node utilities/km-triage-app/progress-emit.js "phase=pr-end" "pr=$num" "action_taken=skipped" "head_sha=$headSha" 2>$null } catch {}
}

# Returns the most recent substantive audit entry for a PR as a PSCustomObject,
# or $null if none exists.
function Get-LastAuditEntry {
  param($num)
  if (-not (Test-Path $auditLog)) { return $null }
  $substantive = @("approve_park","auto_fix_only","mention_only","fix_and_mention","escalate","auto_fix_attempt_failed")
  $last = $null
  foreach ($line in (Get-Content $auditLog)) {
    if (-not $line) { continue }
    try {
      $entry = $line | ConvertFrom-Json
      if ($entry.pr -eq $num -and $substantive -contains $entry.action_taken) {
        $last = $entry
      }
    } catch {}
  }
  return $last
}

# Returns the id of a lead-trigger comment posted after $sinceTs, or $null.
function Find-TriggerComment {
  param($num, $sinceTs)
  if (-not $sinceTs) { return $null }
  try {
    $match = @(gh api "repos/$repo/issues/$num/comments" |
      ConvertFrom-Json |
      Where-Object { $_.created_at -gt $sinceTs } |
      Where-Object { $triageOwners -contains $_.user.login } |
      Where-Object { $_.body.ToLower().Contains("@km-triage") })
    if ($match.Count -gt 0) { return $match[-1].id }
    return $null
  } catch { return $null }
}

# ── Phase 1: Bootstrap (once per Task Scheduler tick) ────────────────────────

New-Item -ItemType Directory -Force -Path "$inboxDir\runs" | Out-Null
New-Item -ItemType Directory -Force -Path "$inboxDir\diffs" | Out-Null
New-Item -ItemType Directory -Force -Path "$inboxDir\worktrees" | Out-Null

if (-not (Test-Path "$inboxDir\INBOX.md")) {
  Set-Content -Path "$inboxDir\INBOX.md" -Value @"
# Tech Lead Inbox

PRs and questions that need your attention. Append-only; the triage loop adds entries here.

"@
}

if (-not (Test-Path $auditLog)) { New-Item -ItemType File -Path $auditLog | Out-Null }

if (-not (Test-Path "$inboxDir\.labels-created")) {
  gh label create ready-to-merge --color 0e8a16 `
    --description "Triage approved - ready to merge by any team member" 2>$null; $true
  gh label create review-needed --color d93f0b `
    --description "Triage escalated - awaiting submitter or tech-lead response" 2>$null; $true
  gh label create triage-skip --color cfd3d7 `
    --description "Do not run triage on this PR" 2>$null; $true
  New-Item -ItemType File -Path "$inboxDir\.labels-created" | Out-Null
}

try {
  node utilities/km-triage-app/mint-token.js 2>&1 | Out-Null
} catch {
  $ts = Get-Ts
  Add-Content -Path $auditLog -Value ('{"ts":"{0}","action_taken":"auth_failed","reason":"bot_token_unavailable"}' -f $ts)
  Add-Content -Path "$inboxDir\INBOX.md" -Value "[$ts] km-triage bot-token mint failed; run ``node utilities/km-triage-app/setup.js`` to reinstall."
  Write-Error "[ERROR] bot-token unavailable - aborting"
  exit 1
}

# Refresh main so each claude call sees the latest crew/command definitions.
# Stash any local changes so the pull can proceed; restore them after.
git fetch origin main --quiet
git checkout main --quiet
$dirty = [bool](git status --porcelain)
if ($dirty) { git stash push --include-untracked --quiet }
git pull --ff-only --quiet
if ($dirty) { git stash pop --quiet }

# ── Iteration loop ─────────────────────────────────────────────────────────────

for ($i = 1; $i -le $maxIterations; $i++) {
  $priorLineCount = if (Test-Path $auditLog) { @(Get-Content $auditLog).Count } else { 0 }

  $stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
  $sweepId = "$stamp-iter$i"
  $env:KM_TRIAGE_SWEEP_ID = $sweepId
  $log = "$inboxDir\runs\$stamp-iter$i.log"

  "[km-triage] $sweepId starting" | Tee-Object -FilePath $log -Append | Write-Host

  # ── Discover all open PRs (one API call per iteration) ──────────────────

  # commits is omitted here — it blows the GraphQL node limit at --limit 50.
  # HEAD SHA comes from headRefOid; commit authors are fetched per-PR lazily in Gate 7.
  $prsJson = gh pr list `
    --state open `
    --json number,title,author,headRefName,headRefOid,baseRefName,labels,isDraft,mergeable,mergeStateStatus,statusCheckRollup,reviewDecision,isCrossRepository,headRepositoryOwner `
    --limit 50
  if (-not $prsJson) {
    "[km-triage] [WARN] gh pr list returned no output - ending sweep (check GraphQL node limit / auth)" | Tee-Object -FilePath $log -Append | Write-Host
    break
  }
  $prs = @($prsJson | ConvertFrom-Json | Sort-Object number)

  $total  = $prs.Count
  $prNums = ($prs | ForEach-Object { $_.number }) -join ","
  "[km-triage] $total open PRs: [$prNums]" | Tee-Object -FilePath $log -Append | Write-Host
  try { node utilities/km-triage-app/progress-emit.js "phase=sweep-start" "total_prs=$total" "prs=[$prNums]" 2>$null } catch {}

  $nSkip   = 0
  $nReview = 0

  # ── Per-PR gate loop ─────────────────────────────────────────────────────
  # Gates mirror km-triage Phase 2 exactly.  Any PR that passes all gates
  # gets a fresh claude -p "/km-triage $num" with no prior-PR context.

  foreach ($pr in $prs) {
    $num     = $pr.number
    $title   = $pr.title
    $headSha = if ($pr.headRefOid) { $pr.headRefOid } else { "unknown" }
    $author  = $pr.author.login
    $triggerCommentId = $null   # populated lazily; reset each PR

    "  PR #$num : $title" | Tee-Object -FilePath $log -Append | Write-Host

    # Gate 1 — external fork
    if ($pr.isCrossRepository -eq $true) {
      "    skip: external_pr_not_in_scope" | Tee-Object -FilePath $log -Append | Write-Host
      Write-AuditSkip $num "external_pr_not_in_scope" $headSha
      $nSkip++; continue
    }

    # Gate 2 — draft
    if ($pr.isDraft -eq $true) {
      "    skip: draft" | Tee-Object -FilePath $log -Append | Write-Host
      Write-AuditSkip $num "draft" $headSha
      $nSkip++; continue
    }

    # Gate 3 — hard-skip labels
    $labelNames = $pr.labels | ForEach-Object { $_.name }
    if ($labelNames -contains "ready-to-merge" -or $labelNames -contains "triage-skip") {
      "    skip: already_in_lead_queue (label)" | Tee-Object -FilePath $log -Append | Write-Host
      Write-AuditSkip $num "already_in_lead_queue" $headSha
      $nSkip++; continue
    }

    # Gate 4 — CONFLICTING: post notice via bot-gh directly, zero Claude credits
    if ($pr.mergeable -eq "CONFLICTING") {
      "    skip: merge_conflict - posting notice" | Tee-Object -FilePath $log -Append | Write-Host
      $conflictFile = [System.IO.Path]::GetTempFileName()
      $mentionLine = if ($author -eq $tlLogin) {
        "@$tlLogin - km-triage skipped this PR."
      } else {
        "@$tlLogin @$author - km-triage skipped this PR."
      }
      Set-Content -Path $conflictFile -Value @"
$mentionLine

PR is in CONFLICTING merge state. Triage policy is not to auto-fix or review a branch that needs rebasing.

Please rebase against ``main`` first; the next sweep will run the full review crew and either auto-fix mechanical findings or @-mention you again with any open questions.
"@
      try { node utilities/km-triage-app/bot-gh.js pr comment $num --body-file $conflictFile >> $log 2>&1 } catch {}
      Remove-Item -Path $conflictFile -Force -ErrorAction SilentlyContinue
      Write-AuditSkip $num "merge_conflict" $headSha
      $nSkip++; continue
    }

    # Gate 5 — mergeability unknown
    if ($pr.mergeable -eq "UNKNOWN") {
      "    skip: mergeability_unknown" | Tee-Object -FilePath $log -Append | Write-Host
      Write-AuditSkip $num "mergeability_unknown" $headSha
      $nSkip++; continue
    }

    # Gate 6 — CI blocking (any required check not SUCCESS/NEUTRAL/SKIPPED)
    $ciBlocking = 0
    if ($pr.statusCheckRollup) {
      foreach ($check in $pr.statusCheckRollup) {
        if (-not $check.isRequired) { continue }
        $passing = @("SUCCESS","NEUTRAL","SKIPPED")
        $state = if ($check.__typename -eq "CheckRun") {
          if ($check.conclusion) { $check.conclusion } else { $check.status }
        } else {
          $check.state
        }
        if ($state -notin $passing) { $ciBlocking++ }
      }
    }
    if ($ciBlocking -gt 0) {
      "    skip: ci_not_ready ($ciBlocking blocking)" | Tee-Object -FilePath $log -Append | Write-Host
      Write-AuditSkip $num "ci_not_ready" $headSha
      $nSkip++; continue
    }

    # Gate 7 — solo tech-lead authorship (lazy commits fetch — not in bulk query)
    $prCommits = @()
    try {
      $prCommits = @((gh pr view $num --json commits --jq '.commits' | ConvertFrom-Json))
    } catch { $prCommits = @() }
    if ($prCommits.Count -gt 0) {
      $allEmails = $prCommits | ForEach-Object { $_.authors | ForEach-Object { $_.email } } | Sort-Object -Unique
      $nonTl = $allEmails | Where-Object { $_ -ne $tlEmail }
      if (-not $nonTl) {
        "    skip: solo_tech_lead_author" | Tee-Object -FilePath $log -Append | Write-Host
        Write-AuditSkip $num "solo_tech_lead_author" $headSha
        $nSkip++; continue
      }
    }

    # Gates 8+9 share the last audit entry — read once per PR
    $lastEntry       = Get-LastAuditEntry $num
    $lastAuditTs     = if ($lastEntry) { $lastEntry.ts }            else { "" }
    $lastAuditSha    = if ($lastEntry) { $lastEntry.head_sha }      else { "" }
    $lastAuditAction = if ($lastEntry) { $lastEntry.action_taken }  else { "" }

    # Gate 8 — review-needed label + no trigger comment since last audit
    if ($labelNames -contains "review-needed") {
      $triggerCommentId = Find-TriggerComment $num $lastAuditTs
      if (-not $triggerCommentId) {
        "    skip: already_in_lead_queue (review-needed, no trigger)" | Tee-Object -FilePath $log -Append | Write-Host
        Write-AuditSkip $num "already_in_lead_queue" $headSha
        $nSkip++; continue
      } else {
        "    trigger comment #$triggerCommentId - removing review-needed" | Tee-Object -FilePath $log -Append | Write-Host
        try { node utilities/km-triage-app/bot-gh.js api "repos/$repo/issues/$num/labels/review-needed" -X DELETE >> $log 2>&1 } catch {}
        # fall through - Claude handles the re-review
      }
    }

    # Gate 9 — same head SHA as last review + no trigger comment
    # Exception: auto_fix_only + unchanged SHA = push silently failed; re-run.
    if ($lastAuditSha -and $lastAuditSha -eq $headSha) {
      if ($lastAuditAction -eq "auto_fix_only") {
        "    [WARN] auto_fix_push_unverified - re-running review" | Tee-Object -FilePath $log -Append | Write-Host
        Add-Content -Path "$inboxDir\INBOX.md" -Value ("[{0}] PR #{1}: auto_fix_only recorded but head SHA unchanged - re-running" -f (Get-Ts), $num)
        # fall through to Claude
      } else {
        if (-not $triggerCommentId) {
          $triggerCommentId = Find-TriggerComment $num $lastAuditTs
        }
        if (-not $triggerCommentId) {
          "    skip: no_new_commits_since_last_review" | Tee-Object -FilePath $log -Append | Write-Host
          Write-AuditSkip $num "no_new_commits_since_last_review" $headSha
          $nSkip++; continue
        }
        # Has trigger comment - fall through to Claude
      }
    }

    # All gates cleared - spawn a fresh, isolated Claude process for this PR
    "    -> spawning claude for PR #$num" | Tee-Object -FilePath $log -Append | Write-Host
    $nReview++
    # Clear CLAUDECODE so a triage launched from inside a Claude Code session
    # doesn't trigger the nested-session error in the spawned process.
    $savedClaudeCode = $env:CLAUDECODE
    $env:CLAUDECODE = ""
    try {
      & $claude -p "/km-triage $num" --model $model --dangerously-skip-permissions --output-format text *>> $log
      if ($LASTEXITCODE -ne 0) {
        "    [WARN] claude exited $LASTEXITCODE for PR #$num" | Tee-Object -FilePath $log -Append | Write-Host
      }
    } catch {
      "[WARN] claude exited with error for PR #$num : $_" | Add-Content $log
    } finally {
      if ($null -eq $savedClaudeCode) { Remove-Item Env:\CLAUDECODE -ErrorAction SilentlyContinue }
      else { $env:CLAUDECODE = $savedClaudeCode }
    }
  }

  "[km-triage] iteration $i : $nReview reviewed, $nSkip skipped" | Tee-Object -FilePath $log -Append | Write-Host
  Remove-Item Env:\KM_TRIAGE_SWEEP_ID -ErrorAction SilentlyContinue

  # ── Decide whether to re-sweep ───────────────────────────────────────────
  # Re-sweep if any action moved a head SHA (auto_fix_only, fix_and_mention).

  if (-not (Test-Path $auditLog)) { break }
  $newLines = @(Get-Content $auditLog) | Select-Object -Skip $priorLineCount
  $shouldLoop = $false
  foreach ($line in $newLines) {
    if (-not $line) { continue }
    try {
      $entry = $line | ConvertFrom-Json
      if ($loopOnActions -contains $entry.action_taken) {
        $shouldLoop = $true
        break
      }
    } catch {}
  }

  if (-not $shouldLoop) { break }
  if ($i -lt $maxIterations) { Start-Sleep -Seconds $sleepBetweenSec }
}
