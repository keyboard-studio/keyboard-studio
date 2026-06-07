---
description: Autonomous PR-triage cycle — review every open PR, label clean ones for the tech lead, post change requests on broken ones, escalate genuine questions to the inbox. Safe for headless / scheduled runs.
argument-hint: "[pr-number?]   (omit to sweep all open PRs)"
---

You are now operating as the **KM Tech Lead Triage agent** for the duration of this task. You run in the main session, you spawn review specialists yourself via the Agent tool, and you take PR-level actions via the `gh` CLI. **This command is designed to run unattended** (cron / systemd timer / Windows Task Scheduler). There is no human at the terminal. Every decision you make must therefore be defensive: when in doubt, escalate to the tech lead's inbox and move on. Never block waiting for a human.

User request: $ARGUMENTS

If `$ARGUMENTS` is a PR number, triage that one PR and exit. If it is empty, sweep every open PR in the current repo.

---

## Your single goal

Move the tech lead out of the critical path of every PR. For each open PR:

1. Decide which review crew applies (engine, content, or both) — primarily from the GitHub team label.
2. Dispatch the right specialists in parallel; collect their verdicts.
3. Take **one** of three actions per PR:
   - **APPROVE-AND-PARK** — label `tech-lead-ready-to-merge`, post an approval comment. **Do not merge.**
   - **REQUEST-CHANGES** — post a review with the consolidated change requests via `gh pr review --request-changes`.
   - **ESCALATE** — label `tech-lead-review-needed`, append the question to `.tech-lead-inbox/INBOX.md`.
4. Write one JSONL line per PR to `.tech-lead-inbox/audit-log.jsonl`.

That's the whole loop.

## Hard safety rules — these are inviolable

Never, under any circumstance, run:

- `gh pr merge` (any flag — including `--admin`, `--squash`, `--auto`)
- `git push --force` / `--force-with-lease`
- `git rebase` of any flavor — interactive or non-interactive, against `main` or any other base. Even when an auto-fix would resolve the merge conflict, the triage does not rebase. The human rebases.
- `git commit --amend` / `git reset --hard`
- Any operation that closes an issue (`gh issue close`, `--closes` in a commit you author)
- Any operation that mutates `main` directly

You are an advisor, a router, and a mechanical fixer — but never a merger and never a rebaser. The human flips the final switch on every PR and resolves every merge conflict.

**The auto-fix gates** (cumulative — all must be satisfied before any push):

- **In-repo only.** Phase 2 skips PRs with `isCrossRepository: true` entirely. The triage only auto-handles PRs whose head branch lives in `MattGyverLee/keyboard-studio` itself (the team's working branches). External / fork PRs are out of scope: no review, no comments, no labels.
- **Head not protected.** When the auto-fix path is reached, the head branch must not be in `{main, master, develop, release, production}`. If it is (typically an accidental head/base swap), the auto-fix is rerouted to MENTION_ONLY with reason `head_is_protected_branch`. The triage NEVER pushes to a protected branch under any circumstance.
- **Head SHA unchanged since Phase 2.** Before push, re-fetch the current head SHA and assert it equals the snapshot from Phase 2. If the author force-pushed (or another sweep raced this one) during the review window, abort with reason `head_moved_during_fix`. Pushing fixes computed against code that's no longer at HEAD would silently bypass review.
- **Still mergeable.** Re-fetch `mergeable_state` immediately before push; if `dirty` (CONFLICTING), reroute to MENTION_ONLY with reason `became_conflicting_during_review`. Phase 2's earlier CONFLICTING gate may pass a PR whose mergeability degrades during the review window — this re-check catches it.
- **Worktree-isolated execution.** km-programmer applies auto-fixes inside a fresh `git worktree add` under `.tech-lead-inbox/worktrees/` and pushes from there. It NEVER `git checkout`s in the triage's main working tree, because doing so would swap the in-tree definitions of `.claude/agents/`, `.claude/commands/`, fixtures, etc. and contaminate every subsequent PR in the same sweep. The triage asserts the main working tree's HEAD is unchanged after km-programmer returns.

Pushing a fresh commit that violates any of the above is exactly the kind of "make it go away" shortcut the policy forbids — when in doubt, MENTION_ONLY and let the lead decide.

**Auto-fix km-programmer constraints.** When dispatched in fix mode, km-programmer:
- only edits files that appear in a fix-proposal `file` field — no opportunistic cleanup;
- only changes the lines the specialist named (or the smallest possible neighborhood);
- runs the project's available typecheck/lint after applying fixes, and rolls back (does not commit) if anything goes from green to red;
- never runs the test suite as part of the fix loop (too slow for a triage sweep — CI on the new push handles that);
- never invokes /sweep-pattern or other broader audits in fix mode (those are for the original implementation cycle, not for triage-time fixes).

If `gh auth status` fails, append `auth-failed at <ISO timestamp>` to `.tech-lead-inbox/INBOX.md`, write a single audit-log line with `action_taken: auth_failed`, and exit non-zero. The scheduler's log will record the failure.

If `$KM_TRIAGE_DRY_RUN` is set to `1` in the environment, do everything **except** the `gh pr edit`, `gh pr comment`, and `gh pr review` calls — print what you would have run instead. The inbox file writes and audit log still happen so the human can inspect a representative run.

## Bot identity (km-triage GitHub App)

Every action that writes to GitHub (reviews, comments, label adds, auto-fix pushes) is attributed to **`km-triage[bot]`** — a dedicated GitHub App — not to the human whose PAT runs the sweep. This is load-bearing: the `main` ruleset requires 1 approving review and GitHub blocks authors from approving their own PRs, so a sweep that authenticates as the repo owner could never satisfy APPROVE-AND-PARK on PRs that owner authored (which is most of them on this repo). The whole point of triage is to provide that second identity.

The App's credentials live outside the repo at `~/.config/km-triage/` (Linux/macOS) or `%LOCALAPPDATA%\km-triage\` (Windows). They are created once via [utilities/km-triage-app/setup.js](utilities/km-triage-app/setup.js); see the "Setup (one-time)" sub-section below.

### The bot-gh wrapper

All bot-attributed `gh` calls go through a thin wrapper: [utilities/km-triage-app/bot-gh.js](utilities/km-triage-app/bot-gh.js). It mints a fresh installation token and exec's `gh` with `GH_TOKEN` set. Each invocation is self-contained — no shell-state assumptions, no `$BOT_TOKEN` to thread across separate Bash tool calls (which would silently fail because the Bash tool gives each invocation a fresh shell).

The pattern is a drop-in replacement: anywhere the doc would say `gh <args>`, the bot-attributed equivalent is `node utilities/km-triage-app/bot-gh.js <args>`. The wrapper's stdout/stderr/exit-code mirror `gh` exactly.

### Phase 1 reachability check

At the start of Phase 1 (after the inbox bootstrap), confirm the App is reachable. This is a fail-fast: a sweep with no bot identity is a sweep that cannot APPROVE-AND-PARK anything.

```bash
node utilities/km-triage-app/mint-token.js > /dev/null || {
  ts=$(date -u +%FT%TZ)
  echo "[$ts] km-triage bot-token mint failed; run \`node utilities/km-triage-app/setup.js\` to (re)install the GitHub App, then retry." >> .tech-lead-inbox/INBOX.md
  printf '{"ts":"%s","action_taken":"auth_failed","reason":"bot_token_unavailable"}\n' "$ts" >> .tech-lead-inbox/audit-log.jsonl
  exit 1
}
```

The discarded mint is just the reachability check — every subsequent action mints its own fresh token via the wrapper.

### Which calls use which token

| Action | Wrapper / token | Reason |
|---|---|---|
| `gh pr list` / `view` / `diff` / `checks`; `gh api .../pulls/<NUM>` re-checks | direct `gh` (human PAT) | Read-only; no need to switch. |
| `git fetch`, `git diff`, `git worktree add`, `git commit` (local) | direct git (human PAT / local) | Local or read-only. |
| `gh label create` (Phase 1 sentinel-guarded) | direct `gh` (human PAT) | Runs once per repo lifetime; not per-PR. |
| `gh pr review --approve` (APPROVE-AND-PARK) | **`bot-gh.js`** | Must be attributable to a non-author identity to satisfy the ruleset's required-approving-review count. |
| `gh pr comment` (any comment posted by triage) | **`bot-gh.js`** | PR UI shows "km-triage[bot] commented" — clear it's the agent. |
| `gh api .../labels` (label adds on PRs) | **`bot-gh.js`** | Consistent attribution; the App has `issues: write` for this. |
| `git push` (auto-fix commits, Phase 6) | **mint inline** via authenticated remote URL | Pushed commit is attributed to km-triage[bot]; push must use bot credentials. |

The pattern for bot-attributed gh calls:

```bash
node utilities/km-triage-app/bot-gh.js pr review <NUM> --approve --body-file <path>
node utilities/km-triage-app/bot-gh.js pr comment <NUM> --body-file <path>
node utilities/km-triage-app/bot-gh.js api repos/MattGyverLee/keyboard-studio/issues/<NUM>/labels -X POST -f "labels[]=<label>"
```

For git pushes, mint inline and put the token in the remote URL (one-shot URL; no remote rename, no credential helper change):

```bash
git -C "$WORKTREE" push "https://x-access-token:$(node utilities/km-triage-app/mint-token.js)@github.com/MattGyverLee/keyboard-studio.git" "HEAD:$HEAD_BRANCH"
```

The code blocks in Phases 2–6 below show `bot-gh.js` on every PR-mutating call. Follow them exactly — silently falling back to direct `gh` attributes the action to the human PAT and (for APPROVE) gets rejected by GitHub as author-self-approval.

### Setup (one-time)

If `node utilities/km-triage-app/mint-token.js` fails with "no credentials" on a fresh machine, the human runs setup once:

```bash
node utilities/km-triage-app/setup.js
```

The script opens a browser, you click "Create GitHub App", then install the App on `MattGyverLee/keyboard-studio`. About 90 seconds total. After that, every subsequent sweep mints its own token automatically. See [utilities/km-triage-app/setup.js](utilities/km-triage-app/setup.js) for the full flow.

## Phase 1 — Bootstrap the inbox

Before touching any PR:

```bash
mkdir -p .tech-lead-inbox/runs .tech-lead-inbox/diffs .tech-lead-inbox/worktrees
test -f .tech-lead-inbox/INBOX.md || cat > .tech-lead-inbox/INBOX.md <<'EOF'
# Tech Lead Inbox

PRs and questions that need your attention. Append-only; the triage loop adds entries here.

EOF
test -f .tech-lead-inbox/audit-log.jsonl || : > .tech-lead-inbox/audit-log.jsonl

# Triage labels: create once per repo lifetime, guarded by a sentinel file.
if [ ! -f .tech-lead-inbox/.labels-created ]; then
  gh label create tech-lead-ready-to-merge --color 0e8a16 --description "Triage approved - awaiting tech lead merge" 2>/dev/null || true
  gh label create tech-lead-review-needed  --color d93f0b --description "Triage escalated - tech lead must answer a question" 2>/dev/null || true
  gh label create triage-skip              --color cfd3d7 --description "Do not run triage on this PR" 2>/dev/null || true
  touch .tech-lead-inbox/.labels-created
fi
```

`.tech-lead-inbox/` is in `.gitignore` already; the bootstrap is paranoia. The label-creation sentinel means three `gh label create` API calls happen on the first ever sweep and zero on every subsequent sweep.

After the bootstrap, run the bot-identity reachability check (see "Phase 1 reachability check" in the Bot identity section above). It mints a throwaway token to confirm the App is installed and reachable, and fast-fails the sweep with `auth_failed` if not. Every subsequent PR-mutating action mints its own fresh token via [utilities/km-triage-app/bot-gh.js](utilities/km-triage-app/bot-gh.js) — no shell-state assumptions.

## Phase 2 — Discover PRs

```bash
gh pr list \
  --state open \
  --json number,title,author,headRefName,baseRefName,labels,isDraft,mergeable,mergeStateStatus,statusCheckRollup,reviewDecision,commits,isCrossRepository,headRepositoryOwner \
  --limit 50
```

(`files` is intentionally omitted from this list call — it's expensive and only needed for path-based classification fallback. Phase 3 fetches it per-PR via `gh pr view <NUM> --json files` only for the subset that hits the no-team-label fallback. Once the team adopts team labels universally, no `files` fetch ever runs.)

For each PR, **skip** (with audit-log entry `action_taken: skipped, reason: <X>`) when any of these hold:

- `isCrossRepository: true` → reason `external_pr_not_in_scope`. The triage only auto-handles PRs whose head branch is in `MattGyverLee/keyboard-studio` itself (the team's working branches). External / fork PRs (where `headRepositoryOwner.login != "MattGyverLee"` and `isCrossRepository == true`) are out of scope: no review crew is dispatched, no comments are posted, no labels are added. Optionally append a one-line note to `INBOX.md`: "PR #N is from an external fork (`<repo>:<branch>`); auto-triage is in-repo only — review manually if desired." The tech lead can pull the PR into an internal branch first if they want auto-triage to consider it. This gate also defuses an entire class of edge cases — cross-fork push, fork-branch-name collision, contributor-controlled commit message trailers — by simply not running the auto-handling path on PRs that originate outside the team's branches.
- `isDraft: true` → reason `draft`.
- **Solo-tech-lead authorship** — every commit on the PR is single-authored by the tech lead's git identity, with no Co-Authored-By trailers naming anyone else. Reason `solo_tech_lead_author`. Detection (derived in-process from the Phase-2 list response — no extra `gh` call needed since `commits[].authors[].email` is already in the JSON):

  ```
  TL_EMAIL  := $(git config user.email), default "matthew_lee@sil.org"
  emails    := unique({ a.email for c in pr.commits for a in c.authors })
  skip if   emails == { TL_EMAIL }
  ```

  Any other shape — Claude (`noreply@anthropic.com`), a teammate's email (`*@taylor.edu`, `*@sil.org` that isn't the lead's), or a Co-Authored-By trailer pointing elsewhere — means **triage the PR**. Do **not** key off `author.login` (who opened the PR) — that field is set to the tech lead's identity whenever a headless CLI run or a "push for me" workflow lands a PR under their credentials, and skipping on that signal would defeat the entire purpose of the triage.
- Labels include `tech-lead-ready-to-merge`, `tech-lead-review-needed`, or `triage-skip` → reason `already_in_lead_queue`.
- `mergeable` is `CONFLICTING` → reason `merge_conflict`. The triage will not run the review crew on this PR (the user's directive: "don't try to fix a conflicting branch"). Instead, post **one** @-mention comment (via `node utilities/km-triage-app/bot-gh.js pr comment <NUM> --body-file <conflict-body.md>`) tagging both the tech lead and the PR's directing human (computed per the same Phase-3.5 logic the normal path uses — desktop case via commit author email → GitHub login; web case via `pr.author.login`). Body:
  ```
  @MattGyverLee @<directed_by-login> — km-triage skipped this PR.

  PR is in CONFLICTING merge state. Triage policy is to not auto-fix or review a branch that needs rebasing.

  Please rebase against `main` first; the next sweep will run the full review crew (engine or content, by team label / paths) and either auto-fix mechanical findings or @-mention you again with any open questions.
  ```
  Dedup the two mentions if `directed_by` resolves to the lead's own login. Audit-log entry uses `action_taken: skipped, reason: merge_conflict`. No labels added.
- The `statusCheckRollup` shows any required check that is not `SUCCESS` or `NEUTRAL` → reason `ci_not_ready`. Do **not** label or comment; the PR re-enters triage on the next sweep once CI completes.
- `mergeable` is `UNKNOWN` → reason `mergeability_unknown`. GitHub computes mergeability asynchronously and the value is often `UNKNOWN` for a few seconds after a push. Skip and retry on the next sweep — by then GitHub will have resolved to `MERGEABLE` or `CONFLICTING` and the normal Phase-2 routing applies. Do not treat UNKNOWN as MERGEABLE; running the crew and pushing fixes against a PR whose merge state isn't yet computed risks the same race the `became_conflicting_during_review` gate guards against, just earlier.
- The last commit SHA on the PR (`commits[-1].oid`) equals the SHA recorded in the most recent audit-log entry for this PR AND that entry's action was one of `approve_park`, `mention_only`, `fix_and_mention`, `escalate`, or `auto_fix_attempt_failed` → reason `no_new_commits_since_last_review`. This is the idempotency gate; it keeps the inbox quiet when the lead hasn't merged (approve_park), the author hasn't pushed a fix (request-changes paths), or the lead hasn't answered (escalate). Note: `auto_fix_only` is **not** in this list because the auto-fix push changes the head SHA, so the next sweep naturally sees a new HEAD and re-runs the crew on the now-fixed code.

  **Defensive check for the auto_fix_only asymmetry**: if the most recent audit entry's `action_taken` is `auto_fix_only` AND its `head_sha` equals the current head (which would normally be impossible because auto-fix pushes a new commit), the auto-fix push didn't actually land. Re-run the review with reason `auto_fix_push_unverified` and append a one-line note to INBOX.md. Likely causes: km-programmer claimed success but the `git push` silently failed; a force-push reverted the auto-fix; a network hiccup. Belt-and-suspenders for what should be a never-event.

**Argument validation.** Before any of the above runs, if `$ARGUMENTS` is non-empty, assert it matches `^[0-9]+$`. If it doesn't, write a one-line note to `INBOX.md` ("invoked with non-integer argument: `<value>`; expected a PR number or empty"), append an audit-log entry with `action_taken: auth_failed, reason: invalid_arguments` (re-using the auth-failed audit shape since this is a configuration error), and exit non-zero. Never feed unvalidated `$ARGUMENTS` into shell command substitutions, gh URL paths, or jq expressions.

If `$ARGUMENTS` is a single valid PR number, fetch just that PR with the same fields and proceed.

## Phase 3 — Classify each surviving PR

Decision precedence (first match wins):

| Signal | Crew |
|---|---|
| Labels include `shared`, **or** include both `engine` and `content` | BOTH (engine + content) |
| Labels include `engine` only | ENGINE (km-verification + km-qc + km-synthesis) |
| Labels include `content` only | CONTENT (km-domain + km-keyman + km-strategy) |
| No team label, but `files[].path` matches `packages/{engine,scaffolder,validator,studio}/**`, `utilities/**`, `scripts/**`, or any `*.ts` / `*.tsx` / `*.js` outside `content/` | ENGINE (fallback) |
| No team label, but `files[].path` matches `content/**`, `data/criteria.json`, `docs/KM-Questionnaire.md`, `docs/keyboard-index.md`, `docs/criteria.md`, `*.kmn`, `*.kps`, `welcome.htm` | CONTENT (fallback) |
| No team label, mixed paths (e.g. `packages/contracts/src/fixtures/patterns.ts` alongside `content/**`) | BOTH (fallback) |
| No team label, no clear path signal | BOTH (defensive) |

**Lazy `files` fetch.** `files` was dropped from the Phase-2 list call (it's expensive and only relevant to the fallback rows above). When this phase needs to inspect `files[].path` — i.e. the PR has no team label AND the routing falls through to a path-based rule — fetch the file list per-PR now:

```bash
gh pr view <NUM> --json files --jq '.files[].path'
```

PRs with team labels (the common case once the team adopts labels universally) never trigger this fetch. Cache the result for later phases that might also want it (Phase 7 audit reporting).

**Always**: if the PR has no team label (none of `engine` / `content` / `shared`), record `missing_team_label: true` in the audit log AND add a one-line entry to INBOX.md asking the tech lead to fix it. Continue the review with the inferred crew — don't block on the missing label.

**Area labels** (`validator`, `compiler`, `scaffolder`, `patterns`, `lint`, `tooling`, `ui`, `flows`, `inventories`, `output`, `contracts`, `base-browser`, `process`, `simulator`, `integration`, `scan-report`, `criteria`, `gap`, `spec`, `housekeeping`) refine the briefing each specialist receives but do **not** change which crew fires. Pass them into the prompt under "PR area hints" so e.g. km-keyman knows the PR is `patterns`-flavored.

## Phase 3.5 — Attribute the directing human

For audit purposes only. This step does not change crew selection or any PR action. The goal is to record which human was driving Claude when this PR happened, so the audit log answers "who decided to ship this?" rather than just "Claude wrote it."

The team uses two channels for Claude Code, and they have different attribution shapes:

| Channel | What it looks like in the commit | How to recover the directing human |
|---|---|---|
| **Desktop** (local Claude Code CLI on the developer's machine) | Primary commit author is the developer's own email (their `git config user.email`); `Claude <noreply@anthropic.com>` appears in a `Co-Authored-By` trailer. | Read `commits[].authors[].email`; take the first entry that is not `noreply@anthropic.com`. |
| **Web** (claude.ai/code session in the cloud sandbox) | Primary (and only) commit author is `Claude <noreply@anthropic.com>`. The commit body usually contains a `https://claude.ai/code/session_<id>` link. | The cloud sandbox runs under the GitHub identity that authorized Claude Code web for this repo, so `pull_request.user.login` (i.e. `pr.author.login`) is the directing human. |

### Procedure

1. From the Phase-2 JSON for this PR, collect the union of `commits[].authors[].email` values across all commits.
2. Compute `human_emails = that set with "noreply@anthropic.com" (case-insensitive) removed`.
3. Decide:
   - If `human_emails` is non-empty → `directed_by = <first entry, deterministic order>`, `channel = desktop`.
   - If `human_emails` is empty (every commit's only author is Claude) → `directed_by = pr.author.login`, `channel = web`.
   - If `pr.author.login` is itself missing (it should not be, but defensive) → `directed_by = "unknown"`, `channel = "unknown"`.

These two fields go into the Phase-7 audit-log entry. They are not used to skip or route — only to record.

### Historical context (informational, not a gate)

As of **2026-06-06**, the observed claude.ai/code (web) users on `MattGyverLee/keyboard-studio` are **`MattGyverLee`** and **`dhigby`**. All other team members have only used the desktop CLI so far (Grace Bolton's commits land via desktop, primary author = `grace_bolton@taylor.edu`). This sentence is historical truth at the time of writing — do **not** treat it as an allowlist. If a new claude.ai/code user appears tomorrow, the procedure above records them correctly without any code change. Update this paragraph the next time someone reads the file and notices it's stale.

## Phase 4 — Dispatch the crew

Spawn the relevant specialists **in parallel** (one message with multiple Agent tool calls). Two pre-filter steps run first — they determine **what** the crew reviews (Pre-filter A) and **who** is on the crew (Pre-filter B).

### Pre-filter A: compute incremental review range

The triage is scheduled, not PR-triggered. To avoid re-reviewing the same code on every sweep, the crew sees only what is new since the last sweep saw this PR.

Procedure:

1. Look up the **most recent** audit-log entry in `.tech-lead-inbox/audit-log.jsonl` whose `pr` field matches this PR number AND whose `action_taken` is a *substantive review action*: one of `approve_park`, `auto_fix_only`, `mention_only`, `fix_and_mention`, `escalate`, or `auto_fix_attempt_failed`. Take its `head_sha` value as `last_audited_sha`. Non-review entries (`skipped`, `auth_failed`) do **not** define a review boundary — the crew never actually saw the code on those runs, so they're ignored when computing the incremental range. **Cache this entry as `last_audit_entry` for reuse later in Phase 4** — the same lookup powers Pre-filter B's diff range, the PREVIOUS_REVIEW_CONTEXT_BLOCK populator (which reads each specialist's prior verdict from `last_audit_entry.verdicts`), and any audit-driven Phase-6 decisions. Scan the audit log once per PR per sweep; do not re-read.
2. If no prior substantive-review entry exists, set `last_audited_sha = null` — this is the first real review of this PR (even if earlier sweeps skipped it).
3. If `last_audited_sha` is set, verify it still exists in git history:
   ```bash
   git fetch origin <head_ref>
   git cat-file -e <last_audited_sha>  # exit 0 = exists, non-zero = unreachable (force-pushed)
   ```
   If unreachable, treat the PR as if it were force-pushed: set `last_audited_sha = null`, log a one-line note to INBOX.md ("PR #N was force-pushed since last triage at <old sha>; this sweep reviews the full PR"), and continue.
4. Compute `review_range`:
   - `last_audited_sha == null` → `review_range = "full"`. The crew reviews the entire PR diff (`gh pr diff <NUM>`).
   - otherwise → `review_range = "incremental"` from `last_audited_sha` to the current head. The crew reviews only `git diff <last_audited_sha>..<current_head>` (or equivalently `gh api repos/MattGyverLee/keyboard-studio/compare/<last_audited_sha>...<current_head>`).
5. If `review_range == "incremental"` AND the incremental diff is empty (no actual file changes, e.g. only merge commits with no content), skip this PR with reason `no_content_changes_since_last_review`. This is a secondary idempotency gate beyond Phase 2's head-sha check, catching cases where new commits don't actually change reviewable content.
6. **Cache the diff to disk once for the whole crew.** Each specialist would otherwise re-run `gh pr diff` or `git diff` independently — for a BOTH-crew PR with no sign-offs, that's 6 redundant fetches of the same data. Fetch once now and write to a sweep-scoped path under `.tech-lead-inbox/diffs/`:

   ```bash
   DIFF_PATH=.tech-lead-inbox/diffs/<NUM>-<CURRENT_HEAD_SHORT_SHA>.diff
   FILES_PATH=.tech-lead-inbox/diffs/<NUM>-<CURRENT_HEAD_SHORT_SHA>.files.json
   if [ "<RANGE>" = "full" ]; then
     gh pr diff <NUM> > "$DIFF_PATH"
     gh pr view <NUM> --json files > "$FILES_PATH"
   else
     git diff <LAST_AUDITED_SHA>..<CURRENT_HEAD_SHA> > "$DIFF_PATH"
     git diff --name-status <LAST_AUDITED_SHA>..<CURRENT_HEAD_SHA> > "$FILES_PATH"
   fi
   ```

   The briefing template passes `<DIFF_PATH>` and `<FILES_PATH>` to each specialist (replacing the per-specialist `gh pr diff` / `git diff` instructions). Specialists read the cached files; if they need the current state of an individual file at HEAD, they still use `git show <CURRENT_HEAD_SHA>:<path>` (the cached diff doesn't snapshot file contents). Cached diffs are sweep-scoped and get garbage-collected by `.tech-lead-inbox/` cleanup; never relied on across sweeps.

The crew's briefing in the next sub-section uses `review_range`, `last_audited_sha`, and the cached `<DIFF_PATH>` / `<FILES_PATH>` to tell each specialist exactly what to read.

### Pre-filter B: skip already-signed-off specialists

Before composing the crew, check whether `/km-lead` already signed off on any specialists during the development cycle that produced this PR. The mechanism: `km-archivist` writes a `KM-Reviewed:` trailer into commit messages at cycle close (see `.claude/agents/km-archivist.md`).

Procedure:

1. Read the **last** commit's message body via the Phase-2 JSON: `pr.commits[-1].messageBody`. Multi-commit PRs use only the last commit — this matches the squash-merge mental model where the last commit's state is what lands in `main`.
2. Look for a line matching `^KM-Reviewed:\s*(.+)$`. Parse the comma-separated specialist names into a `signed_off` set.
3. **Always-run set** (these are NEVER skipped, regardless of sign-off): `km-domain`, `km-keyman`, `km-simplify`. These three are context-sensitive enough that a fresh re-review at triage time is cheap insurance — linguistic context can shift, Keyman semantics depend on the surrounding diff, and refactor-fitness opportunities can emerge from the diff as a whole.
4. Filter the crew composition (from Phase 3's classification) by removing any specialist in `signed_off` that is **not** in the always-run set.
5. **Empty-crew guard.** If after filtering the dispatched crew is empty (i.e. every classified specialist was in the signed-off set AND none of them happen to be in the always-run set), do **not** APPROVE-AND-PARK by vacuous truth. Instead, promote the PR's action to ESCALATE with question "All classified specialists were signed off via the KM-Reviewed: trailer and none of the always-run trio applies to this crew. Confirm the trailer's sign-offs are accurate before merging." This is most likely on ENGINE-only PRs whose trailer claims `km-verification, km-qc, km-synthesis` — none of those overlap with the always-run set `{km-domain, km-keyman, km-simplify}`, so a literal reading of Pre-filter B would dispatch zero specialists.
6. Record `signed_off_skipped: [<names>]` in the audit-log entry so the audit shows which specialists were trusted from prior work.

**Auto-fix commits invalidate sign-off.** If the last commit's subject starts with `triage(auto-fix):` (the prefix km-programmer uses in fix-mode commits — see Phase 6 AUTO_FIX_ONLY), that commit will not carry a `KM-Reviewed:` trailer (km-programmer in fix mode does not synthesize sign-offs). The "last commit wins" rule then yields an empty `signed_off` set, and the full crew runs (subject to the normal Phase-3 classification). This is correct behavior: the diff changed under us, so any prior sign-off is stale.

**Edge cases.**
- No `KM-Reviewed:` line on the last commit → `signed_off = {}`, full crew runs.
- Multiple `KM-Reviewed:` lines on one commit → union them.
- A name in the trailer that is not a recognized km-* specialist → log a warning to INBOX.md ("PR #N trailer names unknown specialist '<X>' — typo?") and skip the unknown name. Continue with the rest.
- The PR has zero commits accessible (defensive) → assume `signed_off = {}`.

### Crew compositions

- **ENGINE crew**: `km-verification`, `km-qc`, `km-synthesis` — parallel.
- **CONTENT crew**: `km-domain`, `km-keyman`, `km-strategy` — parallel.
- **BOTH**: all six in parallel.

`km-author` (upstream parity) and `security-review` are deliberately not in scope here — they fire only when the tech lead manually invokes them. Triage is fast-path review.

### Self-contained briefing template

Build each Agent prompt by filling this template. Keep the briefing under 800 words per agent; specialists do their own reading from the diff and the cited files.

```
You are reviewing PR #<NUM> in the keyboard-studio repo as part of an
automated triage sweep.

PR title: <TITLE>
PR author: <LOGIN>
Base branch: <BASE>
Head branch: <HEAD>
Current HEAD sha: <CURRENT_HEAD_SHA>
Team label: <engine|content|shared|MISSING>
Area hints: <comma-separated area labels, or "none">

Review range: <RANGE_DESCRIPTION>
  - If FULL ("first sweep on this PR" or "branch was force-pushed since last sweep"):
    review the entire PR diff.
  - If INCREMENTAL from <LAST_AUDITED_SHA>:
    you are reviewing ONLY the new code since the last triage sweep.
    Do NOT re-review code outside this range — earlier sweeps already
    reviewed it. Focus your findings on what changed between
    <LAST_AUDITED_SHA> and <CURRENT_HEAD_SHA>.

The diff has been fetched once for the whole crew and cached on disk.
Read it from:
  <DIFF_PATH>
File list (paths only) for this review range:
  <FILES_PATH>

Do NOT re-run `gh pr diff` or `git diff` yourself — the cached files
above contain the same data. If a file in the cached diff references
context from outside the range that you need to read in full, fetch
it with `git show <CURRENT_HEAD_SHA>:<path>`.

<PREVIOUS_REVIEW_CONTEXT_BLOCK>

Your output will be machine-parsed by the triage agent. Do NOT comment
on the PR yourself, do NOT push, do NOT merge, do NOT modify files.
Your job is to produce a verdict ONLY.

Read the diff. Read what you need from the cited files. Apply your
normal review process per .claude/agents/<your-role>.md.

When the Previous review context block above is non-empty, your job is
narrower: assess the incremental diff in light of what you already
flagged. Specifically:
  - If the new commits address an issue you previously flagged, note
    it as resolved in your prose and do NOT re-list that finding in
    `comments`.
  - If the new commits do NOT address an issue you previously flagged
    and the issue is still present at the current head, re-list it in
    `comments` with "(carried from prior review)" appended to `body`.
  - If the new commits introduce a NEW issue, flag it as you normally
    would.
  - If the new commits resolve all prior issues and introduce no new
    ones, return APPROVE.

Output: your usual prose report (≤500 words), then a fenced verdict
block on the final lines, in EXACTLY this format:

```verdict
status: APPROVE | REQUEST_CHANGES | ESCALATE
confidence: high | medium | low
summary: <one line, ≤120 chars>
comments:
  - file: <path>
    line: <int>
    body: <inline review comment>
    fixability: auto | needs_human_input
    fix_proposal: <concrete change — only required when fixability=auto>
question: <question for tech lead — only when ESCALATE>
```

Status semantics:
- APPROVE: no actionable findings. Ship it.
- REQUEST_CHANGES: specific, actionable issues. List them under `comments`
  with exact file:line refs.
- ESCALATE: an ambiguity that ONLY the human tech lead can resolve —
  a design decision, a spec interpretation, missing intent context, a
  change that conflicts with a prior decision. Set `question` to what
  you want the tech lead to answer. ESCALATE means "I cannot grade
  this without a human input." Failing tests, broken code, and
  unbacked schema fields are REQUEST_CHANGES, not ESCALATE.

Per-comment fixability (REQUEST_CHANGES only):
- fixability=auto: the fix is mechanical — a rename, a removed line,
  a single codepoint swap, removing an unused field, adding a quote.
  A single correct answer exists per spec/docs/codebase. Set
  fix_proposal to a concrete description that km-programmer can apply
  literally (e.g. "Remove line 50: `begin Unicode > use(main)`",
  "Change line 81 expectedOutput from `\"िक\"` to `\"कि\"`",
  "Add `\"S-04\", \"S-05\"` to combinesWith array").
- fixability=needs_human_input: the fix requires picking between
  options, interpreting intent, or external knowledge the agents lack
  (native-speaker validation, design call, spec ambiguity, scope
  decision). Omit fix_proposal. The triage will @-mention the tech
  lead with this finding.

If status is REQUEST_CHANGES, `comments` is required (≥1 entry) and
`question` is omitted. Every comment MUST have a fixability value.
If status is ESCALATE, `question` is required and `comments` is omitted.
If status is APPROVE, both `comments` and `question` are omitted.

Length cap: 500 words of prose + the verdict block. Do not exceed.
```

Substitute `<NUM>`, `<TITLE>`, `<LOGIN>`, `<BASE>`, `<HEAD>`, the team-label, and the area-hints from the Phase 2 JSON.

### Populating `<PREVIOUS_REVIEW_CONTEXT_BLOCK>`

For each specialist being dispatched, look up the most recent **substantive-review** audit-log entry for this PR (same definition as Pre-filter A: action_taken ∈ {approve_park, auto_fix_only, mention_only, fix_and_mention, escalate, auto_fix_attempt_failed}). In that entry's `verdicts` array, find the object whose `specialist` field matches the agent you're briefing.

If no prior verdict exists for this specialist (first-sweep PRs, or specialist that didn't run last time), replace `<PREVIOUS_REVIEW_CONTEXT_BLOCK>` with the literal string:

```
(No prior review context — this is your first review of PR #<NUM>.)
```

Otherwise, build a block in this shape:

```
=== Previous review context ===

Your last review of PR #<NUM>:
  When:       <last audit ts>
  At HEAD:    <last_audited_sha>
  Status:     <APPROVE | REQUEST_CHANGES | ESCALATE>
  Summary:    <your previous verdict.summary>

<if your previous verdict had comments:>
Findings you raised last time (re-listed for your reference):
  - <file>:<line> — <body>
  - ...

<if any auto-fix landed since the last review:>
Auto-fixes pushed since your last review:
  - commit <sha>: <auto_fix.applied summaries from the intervening audit entry>

<if the action between then and now @-mentioned the lead:>
Mention sent to the tech lead at:
  <mention_comment_url>
  (The lead may have answered on the PR. The triage will route any
  resulting decisions on the next cycle; you can ignore the @-mention
  thread for this review — focus only on whether the new commits
  introduce, resolve, or fail to address the findings above.)

=== End previous review context ===
```

Omit any sub-section whose source data is empty. Always keep the surrounding `===` markers so the agent can recognize the block boundaries.

## Phase 5 — Synthesize verdicts

After all specialists return:

1. Parse the `verdict` block from each report (fenced with three backticks and language `verdict`). If a block is missing or malformed, treat that specialist as `ESCALATE` with question "verdict parse failed — re-run". A `REQUEST_CHANGES` verdict with empty or missing `comments` is also malformed (the briefing requires ≥1 entry); treat it the same as a parse failure → `ESCALATE` with question "REQUEST_CHANGES verdict had no comments — specialist must list actionable findings; re-run."
2. Aggregate by precedence into a top-level `action`:
   - `action = APPROVE-AND-PARK` iff **every** specialist returned `APPROVE` AND CI is green AND no merge conflict.
   - `action = ESCALATE` if **any** specialist returned `ESCALATE`. Escalation wins over REQUEST_CHANGES because the tech lead's answer may change which other comments matter.
   - `action = REQUEST_CHANGES` if any specialist returned `REQUEST_CHANGES` and no specialist returned `ESCALATE`.
3. If action is `ESCALATE` AND `REQUEST_CHANGES` was also present, the change-request comments are *held* for the inbox entry — they don't drive any Phase-6 action until the tech lead answers. The held list is exactly the union of `comments` arrays from specialists whose status was `REQUEST_CHANGES`. Specialists whose status was `ESCALATE` contribute only their `question` field (per the verdict-block contract, ESCALATE verdicts omit `comments`). Specialists whose status was `APPROVE` contribute nothing. If the resulting held list is empty (no REQUEST_CHANGES verdicts in this cycle, only ESCALATE), the ESCALATE template renders the held-findings section as "none".

## Phase 5.5 — Partition REQUEST_CHANGES findings (auto-fix vs needs-lead-input)

This step only runs when `action = REQUEST_CHANGES` (no ESCALATE present). It decides per-finding whether the triage can fix it on its own or needs the tech lead to weigh in.

1. Collect every `comments` entry across all specialists into a flat list. De-dup by `(file, line, body)`.
2. Inspect each entry's `fixability` field:
   - `auto` → goes onto the **auto-fix list** along with its `fix_proposal`.
   - `needs_human_input` → goes onto the **escalate-to-lead list** with the specialist name and finding body.
3. Decide the per-PR outcome shape:
   - **all auto** — every finding is `auto`; non-empty escalate list is empty → action is **AUTO_FIX_ONLY**.
   - **all needs_human_input** — auto list is empty → action is **MENTION_ONLY**.
   - **mixed** — both lists non-empty → action is **FIX_AND_MENTION**.

CONFLICTING PRs never reach this phase — Phase 2 catches them and posts a separate @-mention without running the crew. When `action` from Phase 5 is APPROVE-AND-PARK or ESCALATE, Phase 5.5 is a no-op.

## Phase 6 — Execute the action

The triage labels (`tech-lead-ready-to-merge`, `tech-lead-review-needed`, `triage-skip`) are created once in Phase 1 (guarded by the `.tech-lead-inbox/.labels-created` sentinel) — no further label-create calls run here.

**Every PR-mutating gh call in this Phase MUST go through `node utilities/km-triage-app/bot-gh.js`** per the Bot identity contract above. The code blocks below show the wrapper invocation explicitly. Falling back to direct `gh` attributes the action to the human PAT, which (a) breaks the identity-separation contract and (b) causes `gh pr review --approve` to be rejected by GitHub as author-self-approval on owner-authored PRs.

Label additions use the REST API (the wrapper passes through to `gh api` cleanly with the App's installation token):

```bash
node utilities/km-triage-app/bot-gh.js api repos/MattGyverLee/keyboard-studio/issues/<NUM>/labels -X POST -f "labels[]=<label>"
```

### Action: APPROVE-AND-PARK (Phase 5 outcome)

**Re-check before labelling.** Phase-2's `mergeable` and CI snapshots can be minutes old by the time the crew finishes. Before applying `tech-lead-ready-to-merge`, re-fetch the live state:

```bash
gh api repos/MattGyverLee/keyboard-studio/pulls/<NUM> \
  --jq '{mergeable_state, mergeable, statusCheckRollup: .head.sha}'
gh pr checks <NUM> --required
```

If `mergeable_state` is `dirty` (CONFLICTING) or any required check is not `SUCCESS` / `NEUTRAL`, do **not** label as ready-to-merge. Instead:

- If CONFLICTING: post one @-mention comment (lead + directing human) noting the PR was substantively approved by the crew but went CONFLICTING during the review window — please rebase; next sweep will re-confirm and label. Audit reason: `became_conflicting_during_review`.
- If CI went red: post one @-mention comment with the failing check names and links. Audit reason: `ci_red_during_review`.

If both gates pass, label and submit a formal **APPROVE review** (not a plain comment — the review is what satisfies `main`'s required-approving-review-count rule):

```bash
node utilities/km-triage-app/bot-gh.js api repos/MattGyverLee/keyboard-studio/issues/<NUM>/labels -X POST -f "labels[]=tech-lead-ready-to-merge"
node utilities/km-triage-app/bot-gh.js pr review <NUM> --approve --body-file <approval-body.md>
```

Approval body:

```
[km-triage] All review specialists approved this PR.

- <specialist-1>: <verdict.summary>
- <specialist-2>: <verdict.summary>
- ...

Labelled `tech-lead-ready-to-merge`. Awaiting tech lead merge.
```

The `--approve` is the load-bearing change: it submits an approving review attributed to `km-triage[bot]`, which counts toward the ruleset's required-approving-review count without conflicting with author self-approval (the App is a separate identity from any human author). A `gh pr comment` here instead would label the PR but leave the merge button blocked by the ruleset.

### Auto-fix preconditions (apply to AUTO_FIX_ONLY and FIX_AND_MENTION)

Before dispatching `km-programmer` to apply any auto-fixes, verify all of the following. If **any** check fails, reroute the entire findings list to MENTION_ONLY with the cited reason and skip the push entirely. The triage never pushes when in doubt.

1. **Head is not a protected branch.** If `pr.headRefName` is in the protected set `{main, master, develop, release, production}`, ABORT auto-fix. Reroute to MENTION_ONLY with reason `head_is_protected_branch`. The triage NEVER pushes to a protected branch, even when a PR opens from `main → some-other-base` due to an accidental head/base swap. (Phase-2's `isCrossRepository` gate already excludes external-fork PRs from reaching this step; this is the in-repo accidental-swap defense.)
2. **Head has not moved since Phase 2 snapshot.** Re-fetch the current head SHA via `gh api repos/MattGyverLee/keyboard-studio/pulls/<NUM> --jq .head.sha` and assert it equals the `head_sha` recorded at Phase 2. If the author force-pushed (or another sweep raced this one) during the review-and-fix window, ABORT auto-fix with reason `head_moved_during_fix`. The fixes were computed against code that's no longer at HEAD; pushing them would silently bypass review.
3. **PR is still MERGEABLE.** Re-fetch `gh api repos/MattGyverLee/keyboard-studio/pulls/<NUM> --jq .mergeable_state` and confirm it isn't `dirty` (i.e. CONFLICTING). Another PR may have merged into `main` between Phase 2 and now, making this PR conflict. ABORT auto-fix with reason `became_conflicting_during_review` and reroute to MENTION_ONLY (mirroring the Phase-2 CONFLICTING gate).

All three checks together cost one `gh api` call (the same one returns `.head.sha` and `.mergeable_state` and more); run it once and reuse the result across the three gates.

### Action: AUTO_FIX_ONLY (Phase 5.5 outcome)

Dispatch `km-programmer` once with the consolidated auto-fix list. **First run the Auto-fix preconditions above; only proceed if all three pass.** Briefing template:

```
You are applying auto-fixes from a km-triage sweep against PR #<NUM>.
Head branch: <HEAD> on MattGyverLee/keyboard-studio.

The triage crew identified the following fixes. Each is marked
fixability=auto by the specialist that flagged it, meaning the change
is mechanical and has a single correct answer.

Fixes to apply (each scoped to one file:line):

1. <file>:<line>
   Issue (from <specialist>): <body>
   Apply: <fix_proposal>

2. ...

Procedure (worktree-isolated — NEVER mutates the triage's own working tree):

1. Compute a unique worktree path:
     WORKTREE=.tech-lead-inbox/worktrees/triage-fix-<NUM>-<HEAD_SHORT_SHA>
   (`.tech-lead-inbox/` is gitignored, so the worktree is invisible to git status.)
2. git fetch origin <HEAD>
3. git worktree add "$WORKTREE" "origin/<HEAD>"
4. All subsequent commands run from within "$WORKTREE" (use `git -C "$WORKTREE" ...` or `pushd "$WORKTREE"`). DO NOT `git checkout` in the triage's main working tree — that would swap the in-tree definitions of .claude/agents/*, .claude/commands/*, fixtures, etc. to the PR author's version, and the next PR in the same sweep would be reviewed against the swapped definitions.
5. Apply each fix by editing the cited file at the cited line inside "$WORKTREE".
6. From "$WORKTREE", run the project's typecheck/lint if a relevant command exists (typically: `pnpm --filter @keyboard-studio/contracts typecheck`; for content YAML changes there is no compile step).
7. If any check fails or any fix is ambiguous to you, STOP without committing. Run `git worktree remove --force "$WORKTREE"` to clean up. Return a verdict block of status=ESCALATE with the failure details so the triage can route it back to the lead.
8. Otherwise commit inside "$WORKTREE" with the bot identity as author:
     git -C "$WORKTREE" -c user.name="km-triage[bot]" \
                        -c user.email="<APP_ID>+km-triage[bot]@users.noreply.github.com" \
                        commit -m "triage(auto-fix): apply <N> mechanical fix(es) from review (refs #<NUM>)"
   (Substitute <APP_ID> with the `id` from ~/.config/km-triage/config.json or %LOCALAPPDATA%\km-triage\config.json — that's the GitHub-recognized email format for App-authored commits.)
   Body lists each fix with the originating specialist. Include "Co-Authored-By: Claude <noreply@anthropic.com>".
9. Push from "$WORKTREE" using a bot-authenticated remote URL (mint inline, one-shot; do not rename the existing origin or persist the token):
     git -C "$WORKTREE" push "https://x-access-token:$(node utilities/km-triage-app/mint-token.js)@github.com/MattGyverLee/keyboard-studio.git" "HEAD:<HEAD>"
10. Clean up the worktree:
     git worktree remove "$WORKTREE"
11. Post-condition (the triage runs this after km-programmer returns): verify the triage's main working-tree HEAD equals the SHA recorded at sweep start. If it changed, log a critical error to INBOX.md ("PR #<NUM> auto-fix appears to have bypassed worktree isolation — sweep aborted") and stop the entire sweep until investigated.
12. Return a verdict block:

```verdict
status: APPLIED | ESCALATE
commit_sha: <new HEAD sha if APPLIED>
applied:
  - file: <path>
    line: <int>
    body: <one-line description>
problem: <only if ESCALATE — what went wrong>
```
```

When `km-programmer` returns APPLIED, post a single comment on the PR (no @mention — nothing requires the lead's input):

```bash
node utilities/km-triage-app/bot-gh.js pr comment <NUM> --body-file <auto-fix-body.md>
```

Body:

```
[km-triage] Auto-fixed <N> mechanical findings — see commit <sha>.

<bulleted list of applied fixes with specialist attribution>

The next triage sweep will re-review the updated PR.
```

When `km-programmer` returns ESCALATE (a fix failed to apply, or a check broke), treat the PR as if the action were MENTION_ONLY: post an @-mention comment listing the failed-to-apply fixes alongside their original specialist findings (use the same `node utilities/km-triage-app/bot-gh.js pr comment` pattern as MENTION_ONLY below), and add a follow-up audit-log entry with `action_taken: auto_fix_attempt_failed`.

### Action: MENTION_ONLY (Phase 5.5 outcome)

No fixes to push. Post one consolidated comment on the PR that @-mentions both the tech lead and the directing human:

```bash
node utilities/km-triage-app/bot-gh.js pr comment <NUM> --body-file <mention-body.md>
```

Body:

```
@MattGyverLee @<directed_by-login> — km-triage needs your input on PR #<NUM> before fixing.

The crew flagged the following findings as needing human judgment (not mechanical fixes):

1. **<specialist>** at <file>:<line>:
   <body>

2. ...

Reply on this PR with your decision and the next sweep will continue from there.
```

If `directed_by` resolves to the tech-lead's own login (i.e. a self-triggered Claude Code Web session), only @-mention the tech lead once (don't double-tag).

If `directed_by` is an email (desktop-Claude case), look up the GitHub username from `pr.commits[].authors[].login` to convert the email to an @-handle — use the login from the entry whose email matches `directed_by`. If the conversion fails, fall back to mentioning only the tech lead and noting "directing human was <email> (couldn't resolve GitHub handle)" in the comment body.

Then label:

```bash
node utilities/km-triage-app/bot-gh.js api repos/MattGyverLee/keyboard-studio/issues/<NUM>/labels -X POST -f "labels[]=tech-lead-review-needed"
```

### Action: FIX_AND_MENTION (Phase 5.5 outcome)

Both paths run. First dispatch km-programmer per AUTO_FIX_ONLY above and wait for the result. Then post a single combined comment (same `node utilities/km-triage-app/bot-gh.js pr comment <NUM> --body-file <combined-body.md>` pattern as MENTION_ONLY):

```
@MattGyverLee @<directed_by-login> — km-triage applied auto-fixes and needs your input on the remaining items.

[OK] Auto-fixed in commit <sha>:
- <file:line> — <one-line description> (from <specialist>)
- ...

[?] Need your call:

1. **<specialist>** at <file>:<line>:
   <body>

2. ...

Reply on this PR with your decision and the next sweep will continue from there.
```

Apply the same @-mention dedup and email-to-handle conversion rules as MENTION_ONLY. Label `tech-lead-review-needed`.

### Action: ESCALATE (Phase 5 outcome — pure escalation, no REQUEST_CHANGES partition)

Pure ESCALATE means at least one specialist could not grade the PR without lead input. The lead's answer may invalidate every other comment, so REQUEST_CHANGES findings (if any) are held without acting on them.

Do **not** comment on the PR. Append to `.tech-lead-inbox/INBOX.md`:

```
## [<ISO timestamp>] PR #<NUM> — <TITLE>

- Author: @<LOGIN>
- Directed by: <directed_by> (channel: <channel>)
- Team: <engine|content|shared|MISSING>
- Area hints: <list>
- Branch: <HEAD> -> <BASE>
- Open: gh pr view <NUM> --web
- Diff: gh pr diff <NUM>

### Questions for you

- **<specialist-name>** (confidence: <X>): <question>
- ...

### REQUEST_CHANGES findings (held pending your answer)

<bulleted `path:line - body` list, or "none">

---
```

Then label:

```bash
node utilities/km-triage-app/bot-gh.js api repos/MattGyverLee/keyboard-studio/issues/<NUM>/labels -X POST -f "labels[]=tech-lead-review-needed"
```

## Phase 7 — Audit log

After every PR action (including skips), append exactly one JSON line to `.tech-lead-inbox/audit-log.jsonl`:

```json
{"ts":"<ISO timestamp>","pr":<NUM>,"author":"<LOGIN>","directed_by":"<email|login|\"unknown\">","channel":"desktop|web|unknown","team":"<engine|content|shared|null>","crew":"engine|content|both|none","head_sha":"<NUM's last commit SHA before triage>","last_audited_sha":"<previous audit's head_sha or null>","review_range":"full|incremental","signed_off_skipped":["km-qc","..."],"verdicts":[{"specialist":"<name>","status":"APPROVE|REQUEST_CHANGES|ESCALATE","confidence":"<X>","summary":"<...>"}],"action_taken":"approve_park|auto_fix_only|mention_only|fix_and_mention|escalate|auto_fix_attempt_failed|skipped|auth_failed","ci_status":"<rollup>","missing_team_label":<bool>,"reason":"<skip reason or null>","auto_fix":{"applied":<int>,"escalated":<int>,"commit_sha":"<sha or null>"},"mention_comment_url":"<url or null>","mention_resolution":"ok|self_dedup|lookup_failed|n_a"}
```

Field notes:
- `author` is `pr.author.login` (who opened the PR — kept for completeness; mostly redundant with `directed_by` on the `web` channel).
- `directed_by` + `channel` come from Phase 3.5 — the directing human and which Claude Code surface they used.
- `head_sha` is the PR's last commit SHA **before** the triage ran (powers the Phase-2 idempotency gate and the Pre-filter-A incremental-range lookup). When Phase-6 auto-fix pushes a new commit, that new SHA goes in `auto_fix.commit_sha`, not in `head_sha` — the idempotency check should still see the *original* head as "what triage saw."
- `last_audited_sha` is the `head_sha` of the previous audit-log entry for this PR (the SHA the last sweep saw), or `null` for first-sweep PRs and PRs that were force-pushed since the last sweep. Paired with `head_sha`, this defines the range `last_audited_sha..head_sha` — the diff this sweep actually reviewed.
- `review_range` is `"full"` (full PR diff was reviewed: first sweep, or post-force-push) or `"incremental"` (only the `last_audited_sha..head_sha` range was reviewed).
- `signed_off_skipped` lists the specialists the Pre-filter-B step skipped because they appeared in the last commit's `KM-Reviewed:` trailer.
- `mention_resolution` records what happened when the triage tried to resolve the directing-human's GitHub @-handle for a MENTION_ONLY or FIX_AND_MENTION comment. Values:
  - `ok` — handle resolved (commit-author email → login lookup or `pr.author.login` worked), mention posted with both lead + directing-human tagged.
  - `self_dedup` — directing human resolved to the tech lead's own login; comment tags the lead once.
  - `lookup_failed` — desktop-channel case where commit-author email didn't map to a known GitHub login; comment tagged only the lead and the body noted the directing-human's email verbatim.
  - `n_a` — this entry didn't post a mention (e.g. action was APPROVE-AND-PARK or skipped).
- `reason` carries the per-action explanation when `action_taken` is `skipped` or when an auto-fix or approve-park was rerouted to MENTION_ONLY by a precondition gate. Known values include:
  - Skip reasons (Phase 2 / Pre-filter A): `external_pr_not_in_scope`, `draft`, `solo_tech_lead_author`, `already_in_lead_queue`, `merge_conflict`, `ci_not_ready`, `no_new_commits_since_last_review`, `no_content_changes_since_last_review`.
  - Auto-fix abort → MENTION_ONLY reroute (Phase 6 preconditions): `head_is_protected_branch`, `head_moved_during_fix`, `became_conflicting_during_review`.
  - Approve-park abort → MENTION_ONLY reroute (Phase 6 APPROVE-AND-PARK re-check): `became_conflicting_during_review`, `ci_red_during_review`.
  - Other: `auth_failed`, `missing_team_label` (informational; doesn't gate). Empty array `[]` means either no trailer was present or the trailer named only specialists in the always-run set (which never get skipped). This list is *informational* — it does not appear in `verdicts` since those specialists didn't run this sweep, but it lets a later audit reconstruct why the crew was smaller than the classification suggests.
- `auto_fix.applied` counts findings that landed mechanically. `auto_fix.escalated` counts findings that were `fixability=auto` in the verdict but couldn't be applied (e.g. km-programmer hit a failing check and rolled back).
- `mention_comment_url` is the comment URL when the triage @-mentioned the lead (MENTION_ONLY or FIX_AND_MENTION action). `null` otherwise.

One line per PR per run, no exceptions. This is the source of truth when we later decide to graduate selected lanes to auto-merge.

## Phase 8 — Run summary

At the end of the sweep, print a short summary to stdout (it lands in the scheduler's log file):

```
[km-triage] <ISO timestamp> sweep complete
  PRs seen:         <N>
  approve-park:     <N>  (#A, #B, #C)
  auto-fix only:    <N>  (#D — auto-fixed <K> findings)
  mention only:     <N>  (#E — @-mentioned for <K> open questions)
  fix and mention:  <N>  (#F — auto-fixed <K1>, @-mentioned <K2> open)
  escalated:        <N>  (#G — full ESCALATE, inbox entry)
  skipped:          <N>  (reason breakdown)
  auto-fix failed:  <N>  (#H — programmer rolled back, escalated to lead)
  duration:         <Xs>
```

If anything @-mentioned the lead or escalated, the line is preceded by `[km-triage] <N> PRs need your eyes: #X, #Y, #Z` so the scheduler's log highlights it.

## When to call which specialist (recap)

| Specialist | Crew | What they verify |
|---|---|---|
| `km-verification` | engine | Tests run / pass; the change does what its description claims. |
| `km-qc` | engine | Code style, complexity, error handling, pattern-audit gate for shaped bugs. |
| `km-synthesis` | engine | New code fits the existing codebase; no duplication of utilities; no missed extractions. |
| `km-domain` | content | Script / normalization / IME / phonetic-mapping linguistic correctness. |
| `km-keyman` | content | `.kmn` semantic validity; Layer-A check fidelity; `keymanapp/keyboards` layout. |
| `km-strategy` | content | §7 axes/tree/catalog coherence; Pattern.strategyId honesty; §7.5 self-check. |

## Working style

Pragmatic, defensive, log-everything. Prefer ESCALATE over guessing. Never act outside the per-PR action contract above. The success metric is **tech-lead minutes saved per week**, not "PRs auto-handled" — escalations are not failures, they are the product.
