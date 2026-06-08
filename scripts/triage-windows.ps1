# scripts/triage-windows.ps1 - run /km-triage from Task Scheduler
#
# Iterates the triage in-process: a sweep that auto-fixed any PR will
# immediately re-sweep so the now-different head SHAs get re-reviewed,
# instead of waiting for the next Task Scheduler tick. Bounded to a
# small fixed depth so a buggy auto-fix can't drive an infinite loop.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)

# Refresh main so the command sees the latest crew and command defs.
git fetch origin main --quiet
git checkout main --quiet
git pull --ff-only --quiet

$auditLog        = ".tech-lead-inbox\audit-log.jsonl"
$maxIterations   = 3                                                # global cap per Task Scheduler tick
$sleepBetweenSec = 45                                               # let GitHub recompute mergeability after a push
$loopOnActions   = @('auto_fix_only', 'fix_and_mention')            # actions that move HEAD and warrant re-review

New-Item -ItemType Directory -Force -Path ".tech-lead-inbox\runs" | Out-Null

for ($i = 1; $i -le $maxIterations; $i++) {
    # Snapshot the audit log size BEFORE the sweep so we can read only this iteration's entries afterwards.
    $priorLineCount = if (Test-Path $auditLog) { @(Get-Content $auditLog).Count } else { 0 }

    $stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
    $log   = ".tech-lead-inbox\runs\$stamp-iter$i.log"

    # claude.exe is on PATH after install; verify with `where.exe claude` if needed.
    try {
        claude -p "/km-triage" --dangerously-skip-permissions --output-format text *> $log
    } catch {
        "[WARN] iteration $i: claude exited with error: $_" | Add-Content $log
    }

    # Inspect this iteration's audit entries to decide whether to loop again.
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
        } catch {
            # Malformed JSONL line - skip silently; don't let parse errors gate the loop.
        }
    }

    if (-not $shouldLoop) { break }
    if ($i -lt $maxIterations) { Start-Sleep -Seconds $sleepBetweenSec }
}
