# Scheduling `/km-triage`

`/km-triage` is the autonomous PR-triage cycle (see [`.claude/commands/km-triage.md`](../.claude/commands/km-triage.md)). It walks every open PR, dispatches the right review crew, and produces one of three outcomes per PR: **approve-and-park**, **request-changes**, or **escalate to the tech-lead inbox**. It never merges. It never closes issues. Safety is documented in the command file.

This doc covers **how to run it on a schedule** so the tech lead does not have to be in the terminal.

## Operational stance

- **Week 1 (current):** approve-and-park. Clean PRs get labelled `tech-lead-ready-to-merge` and an approval comment. The tech lead clicks merge.
- **Later, after ≥2 weeks of clean audit logs:** promote selected lanes (content-only / docs-only) to auto-merge via a separate `/km-triage-merge-aged` command. Not in scope for v1.

## Where to run it

| Host | Use | When |
|---|---|---|
| Local Windows dev box | Smoke-test, tune verdict prompts, watch the first runs | First 1–2 weeks |
| Always-on Ubuntu server | Production schedule | After the dev-box period |

Both hosts run the same command; only the scheduler differs.

## Prerequisites (both hosts)

1. **Claude Code installed** and logged in under the tech-lead account (the user whose subscription pays for the runs).
2. **`gh` CLI installed and authenticated** as the tech-lead's GitHub user. `gh auth status` must report `Logged in to github.com`. The command escalates to the inbox and exits non-zero if `gh auth status` fails.
3. **A clone of `keyboard-studio` on the host**, kept up-to-date. The schedule should fetch latest `main` before invoking the command — see the wrapper scripts below.
4. **Scheduled runs use `--dangerously-skip-permissions`** because no human is at the terminal to answer permission prompts and the triage now calls a wide set of patterns (`bot-gh.js *`, `node utilities/km-triage-app/*`, `git worktree *`, `gh api check-runs`, ad-hoc `gh api repos/...`) that no static allowlist would cover comprehensively. The safety boundary is therefore **not** the local permission system — see the "Safety boundary" section below for what actually contains the bot's blast radius.

## Safety boundary

`--dangerously-skip-permissions` removes the local permission prompts entirely — every tool the triage's session reaches for runs without asking. The triage is not "unsafe" because of three layers that sit *outside* the local permission system:

1. **GitHub App permissions (enforced by GitHub).** The `km-triage` App has `pull_requests: write`, `issues: write`, and `checks: write` — and nothing else. Specifically: it does **not** have `contents: write`. Any attempt by the bot to write a file via the GitHub Contents API returns `403 Resource not accessible by integration`. The App is also **not** in the `main: PR + review` ruleset's `bypass_actors` list, so `PUT /repos/.../pulls/<n>/merge` from the bot token returns the same 403 — the merge endpoint is just as unreachable as the contents-write endpoint.
2. **Hard safety rules in the spec (enforced by prose + by the agent following them).** [`.claude/commands/km-triage.md`](../.claude/commands/km-triage.md) lists explicit forbidden commands: `gh pr merge` and every variant (`--admin`, the bot wrapper, direct REST), force-push, rebase, `--amend`, `--reset --hard`, issue close, direct `main` mutation. The spec is what the triage agent reads at runtime and follows; auditing the spec audits the behavior.
3. **Git push auth context (enforced by git).** When the triage's auto-fix path pushes a commit, the push uses the host's local git auth — not the bot token. On the Ubuntu prod host, configure that auth to a credential that has write access only to feature branches (e.g. a PAT scoped to "selected repositories: keyboard-studio" without admin or branch-protection-bypass rights). Then auto-fix pushes can only land on PR branches, never on `main` directly.

The local permission system was originally a stand-in for "trust the human at the terminal." With no human and three external boundaries doing the actual constraint enforcement, skipping the prompts is the right call. Audit-log JSONL captures every action the triage takes, so post-hoc verification is always possible.

If any of those three layers ever changes (App perms widened, spec rules relaxed, git auth promoted), revisit this decision.

## Dev — Windows Task Scheduler

Smoke-test the command interactively first:

```powershell
# Dry-run a single PR (the command checks $KM_TRIAGE_DRY_RUN)
$env:KM_TRIAGE_DRY_RUN = "1"
claude -p "/km-triage 187"

# Then drop the dry-run env var and run for real on PR #187
Remove-Item Env:KM_TRIAGE_DRY_RUN
claude -p "/km-triage 187"

# Full sweep (all open PRs)
claude -p "/km-triage"
```

Inspect `.tech-lead-inbox/INBOX.md` and `.tech-lead-inbox/audit-log.jsonl` after each run.

Once you're happy with the output, register a scheduled task. Point it at `scripts/triage-windows.ps1` (already in the repo). The script fetches latest `main`, runs `/km-triage`, and re-runs up to 3 times within the same tick when an auto-fix action is detected (bounded by `$maxIterations` and a `$sleepBetweenSec`-second sleep between iterations). See the file itself for the configurable constants.

Then register it (PowerShell, as the tech lead's user — **not** elevated):

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"D:\Github\_Projects\_KM\keyboard-studio\scripts\triage-windows.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 8:00am
$trigger.RepetitionInterval = (New-TimeSpan -Hours 2)
$trigger.RepetitionDuration = (New-TimeSpan -Hours 12)
Register-ScheduledTask -TaskName "km-triage" -Action $action -Trigger $trigger -Description "Autonomous PR triage for keyboard-studio"
```

This fires every 2 hours from 08:00 to 20:00. Tune to taste. Disable with `Disable-ScheduledTask -TaskName "km-triage"`.

## Prod — Ubuntu, user-level systemd timer

systemd timers beat crontab here because failures land in `journalctl` and you can `systemctl status km-triage.service` to see the last run's exit code.

### One-time bootstrap on the server

```bash
# Clone the repo to a stable location
sudo mkdir -p /srv && sudo chown $USER /srv
git clone https://github.com/MattGyverLee/keyboard-studio.git /srv/keyboard-studio
cd /srv/keyboard-studio

# Authenticate gh as the tech lead's GitHub user (interactive, one-time)
gh auth login

# Install Claude Code; log in once
# (Follow the official Claude Code Linux install instructions; the binary
# typically ends up at /usr/local/bin/claude or ~/.local/bin/claude.)
claude /login

# Let the user's services run when no one is logged in
loginctl enable-linger $USER
```

### Service unit

`~/.config/systemd/user/km-triage.service`:

```ini
[Unit]
Description=keyboard-studio autonomous PR triage
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/srv/keyboard-studio
ExecStartPre=/usr/bin/git fetch origin main --quiet
ExecStartPre=/usr/bin/git checkout main --quiet
ExecStartPre=/usr/bin/git pull --ff-only --quiet
ExecStart=/usr/local/bin/claude -p "/km-triage" --dangerously-skip-permissions --output-format text
# Soft cap: never let a stuck run sit forever
TimeoutStartSec=20min
# We log to journalctl, no need for stdout/stderr redirection
StandardOutput=journal
StandardError=journal
```

### Timer unit

`~/.config/systemd/user/km-triage.timer`:

```ini
[Unit]
Description=Fire km-triage every 2 hours during the working day

[Timer]
# Every 2 hours from 06:00 to 22:00, Europe-friendly window
OnCalendar=*-*-* 06,08,10,12,14,16,18,20,22:00:00
Persistent=true
Unit=km-triage.service

[Install]
WantedBy=timers.target
```

### Enable and verify

```bash
systemctl --user daemon-reload
systemctl --user enable --now km-triage.timer

# Check next firing
systemctl --user list-timers km-triage.timer

# Fire one immediately for smoke-test
systemctl --user start km-triage.service

# Watch the run
journalctl --user -u km-triage.service -f
```

To disable: `systemctl --user disable --now km-triage.timer`.

## What the tech lead does (the actual workflow)

Once a day (or whenever the inbox dings):

1. Open `.tech-lead-inbox/INBOX.md`. Scan the timestamped entries. Each one is a PR # with a question.
2. For each escalation: answer the question on the PR itself (`gh pr comment <N>` or in the GitHub UI), then `gh pr edit <N> --remove-label tech-lead-review-needed`. The next triage sweep will re-review with your answer in the comment history.
3. Open the GitHub PR list filtered to `label:tech-lead-ready-to-merge`. For each: read the diff if you want, then `gh pr merge <N> --squash --delete-branch`. The triage agent never does this for you.
4. If a PR is parked but you disagree with the approval, comment your reasoning and `gh pr edit <N> --remove-label tech-lead-ready-to-merge`. Add `triage-skip` if you want the triage to stop touching it.

That's the whole job. Junior devs and content experts continue to push to their branches; triage picks up the next sweep.

## When to add Slack / email escalation

The current escalation channel is **the inbox file plus the GitHub label**. That's enough as long as the tech lead opens INBOX.md daily. If escalations start piling up unread, wire a `Stop` hook (`.claude/hooks/Stop.md`) that calls Gmail or Slack MCP when the run's audit-log has any `action_taken: escalate` entries. The notification logic stays out of the triage command itself — keep the command focused on PR decisions.

## Tuning checklist (after the first week)

- **Too many ESCALATEs that turn out to be REQUEST_CHANGES** → the specialists are being too cautious. Adjust the per-agent Triage-mode prose in `.claude/agents/km-*.md` to be more decisive on the categories that are recurring.
- **Too many APPROVEs that the tech lead overrides** → the verdict bar is too low. Tighten the briefing in `.claude/commands/km-triage.md`.
- **PRs missed because they touch unusual paths** → extend the path-fallback table in the Phase-3 classification, or add an `engine` / `content` label to the issue template so labels are present from PR open.
- **Audit log grows large** → rotate `.tech-lead-inbox/audit-log.jsonl` monthly; it's local state, not source.

## Out of scope (do not add without a separate plan)

- Auto-merge of any kind.
- Force-push, rebase, `--admin` bypass.
- Issue checkbox reconciliation (stays with the human's merge).
- Cross-repo triage (this is keyboard-studio only; the Ubuntu host can host more triages as separate timers if useful).
