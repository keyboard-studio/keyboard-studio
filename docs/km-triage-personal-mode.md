# km-triage — Personal mode

**The escape hatch for running `/km-triage` by hand, under your own GitHub account.**

The main [`/km-triage` command](../.claude/commands/km-triage.md) is written for the unattended service: it authenticates as the `km-triage[bot]` GitHub App, mints installation tokens, and posts under the bot identity. That path requires a one-time `node utilities/km-triage-app/setup.js` to install the App on the machine. A teammate who just wants to triage a PR interactively from their own Claude Code session has no bot identity and should not need one.

**Personal mode** is that path. When active, the triage runs entirely under the operator's own `gh` auth (their PAT) and never touches the bot machinery. km-triage.md keeps only a short mode-detection paragraph and a pointer to this doc; the full rules live here.

## When personal mode is active

Decide once, at the very start of Phase 1, before the reachability check. Personal mode is active if **either**:

1. **`$KM_TRIAGE_INTERACTIVE` is `1`** in the environment (explicit opt-in), **or**
2. **Auto-fallback:** the bot token cannot be minted (`node utilities/km-triage-app/mint-token.js` fails) **and** a human is present (`$CLAUDECODE` is non-empty — true for any interactive Claude Code session; the scheduler wrappers deliberately clear it). In this case, print a one-line notice (`[km-triage] no bot identity; running in personal mode under your own gh account`) and continue in personal mode instead of fast-failing with `auth_failed`.

Otherwise — `$CLAUDECODE` empty (a scheduler wrapper) and a bot token mints cleanly — run in **bot mode**, exactly as km-triage.md describes.

Confirm `gh auth status` succeeds in personal mode; if it doesn't, write the normal `auth_failed` audit line and stop (a personal run with no `gh` auth can do nothing).

## What changes in personal mode

| Mechanism (bot mode) | Personal-mode behavior |
|---|---|
| **Phase 1 reachability check** (`mint-token.js`, fast-fail `auth_failed`) | **Skipped.** No token is minted. |
| **`node utilities/km-triage-app/bot-gh.js <args>`** — every PR-mutating call (comments, label adds, the CONFLICTING / MENTION / ESCALATE comments) | **Replace with plain `gh <args>`.** Same arguments, your own PAT. Comments/labels are attributed to you, not `km-triage[bot]`. |
| **`check-progress.js`** check-run publication (Phase 4 create, Phase 5/6 patches, Pre-filter D `success`) | **The App check-run is skipped** — it mints a bot token and needs the App's `checks: write`, which you don't have. Intermediate in-progress PATCHes degrade to the local `progress.jsonl` only. **The final merge gate is still published**, but as a commit status under your own credentials (see "Publishing the merge gate in personal mode" below), not as an App check-run. |
| **Auto-fix `git push`** via `https://x-access-token:$(mint-token.js)@github.com/...` | **Push with your own git auth:** `git -C "$WORKTREE" push origin "HEAD:<HEAD_BRANCH>"`. The commit is attributed to you. All auto-fix gates (head-not-protected, SHA-unchanged, still-mergeable, worktree isolation) still apply unchanged. |
| **`progress-emit.js`** local JSONL | **Unchanged** — pure local file write, no token. |

The local `gh label create` calls in Phase 1 already use plain `gh` (the human PAT) in both modes — no change.

## The merge gate — same story in both modes

Merges into `main` are gated by two required check-runs, not by human approval (see km-triage.md "Complete the `km-triage/review` check run" for the authoritative ruleset facts): `build` (the App-pinned CI build) and `km-triage/review`. The `main: PR + review` ruleset requires a PR but **zero** approving reviews (`required_approving_review_count: 0`). So a successful (APPROVE) triage's job is to publish the `km-triage/review` gate — an approving review is cosmetic, never the merge gate.

Because `km-triage/review` is **not** App-pinned (it has no `integration_id` in the ruleset), any actor with commit-status write can satisfy it — including the operator's own PAT. That is what makes personal-mode gate-publish parity possible.

## APPROVE-AND-PARK in personal mode

The goal is identical to bot mode: on a clean approve, **always** tag the PR ready for **any team member** to merge, and never require the operator who ran the triage (or the tech lead specifically) to be the one who merges.

- **Always** apply the `ready-to-merge` label and post a plain `gh pr comment` summarizing the specialists' verdicts (same body as bot mode, with a closing line noting it was a personal-mode run).
- **Publish the `km-triage/review` gate** (the load-bearing step — see below).
- The optional `gh pr review --approve` is cosmetic. Because `required_approving_review_count` is `0`, it is **not** the merge gate. You may still post it under your own PAT if you are not the PR author and want a visible approving review on record; GitHub blocks self-approval when you are the author, in which case simply skip it — the gate is already satisfied by the published `km-triage/review` status.

The merge itself is always a human click (per the Hard safety rules in km-triage.md, the triage never merges); the point of always-tagging is that any team member, not only the tech lead, can be the one to click it.

### Publishing the merge gate in personal mode

On a clean APPROVE, publish `km-triage/review` as a commit status against the current head SHA using the operator's own GitHub credentials:

```bash
gh api -X POST /repos/keyboard-studio/keyboard-studio/statuses/<HEAD_SHA> \
  -f context=km-triage/review \
  -f state=success \
  -f "description=Approved by km-triage (personal)" \
  -f target_url=<run-url>
```

This satisfies the same `km-triage/review` required check the bot's App check-run satisfies in bot mode, so any team member can merge — no App identity needed.

**Fallback — 403 on status write.** If that POST returns `403` (the operator credential lacks status write — e.g. a heavily-scoped CI/automation token), do **not** treat the PR as approved-and-parked. Reroute to MENTION_ONLY (post the crew's approval as a comment @-mentioning the lead so a human can publish the gate or merge), and write the Phase-7 audit entry with `action_taken: gate_publish_denied`. This keeps personal mode from silently leaving a PR that looks approved but whose merge gate was never actually published.

## Other actions

`MENTION_ONLY` and `ESCALATE` behave identically to bot mode — only the wrapper changes from `bot-gh.js` to `gh`. Auto-fix (`AUTO_FIX_ONLY` / `FIX_AND_MENTION`) does **not** behave identically to bot mode — it is disabled there (km-triage.md Phase 5.5 step 4) and only runs in personal mode. See the next section.

## Auto-fix preconditions and actions

**Personal-mode-only.** In bot mode, km-triage.md's Phase 5.5 step 4 reroutes every `AUTO_FIX_ONLY` / `FIX_AND_MENTION` outcome to a suggest-only `MENTION_ONLY` comment before it ever reaches these procedures — the scheduled sweep never dispatches `km-programmer` or pushes a commit. These routines are moved here (not deleted) so the bot-mode command file stays focused on the path it actually runs, while the full mechanical-fix procedure stays available for personal-mode runs and as the recovery path should bot-mode auto-fix ever be re-enabled.

The briefing template below is written in the bot-identity voice (bot commit author, bot-minted push token) for fidelity with its original km-triage.md wording. Running it in personal mode, substitute the "What changes in personal mode" table above: commit as yourself (skip the `-c user.name`/`-c user.email` override), and push with `git -C "$WORKTREE" push origin "HEAD:<HEAD_BRANCH>"` under your own git auth instead of the bot-minted token URL.

### Auto-fix preconditions (apply to AUTO_FIX_ONLY and FIX_AND_MENTION)

Before dispatching `km-programmer` to apply any auto-fixes, verify all of the following. If **any** check fails, reroute the entire findings list to MENTION_ONLY with the cited reason and skip the push entirely. The triage never pushes when in doubt.

1. **Head is not a protected branch.** If `pr.headRefName` is in the protected set `{main, master, develop, release, production}`, ABORT auto-fix. Reroute to MENTION_ONLY with reason `head_is_protected_branch`. The triage NEVER pushes to a protected branch, even when a PR opens from `main → some-other-base` due to an accidental head/base swap. (Phase-2's `isCrossRepository` gate already excludes external-fork PRs from reaching this step; this is the in-repo accidental-swap defense.)
2. **Head has not moved since Phase 2 snapshot.** Re-fetch the current head SHA via `gh api repos/keyboard-studio/keyboard-studio/pulls/<NUM> --jq .head.sha` and assert it equals the `head_sha` recorded at Phase 2. If the author force-pushed (or another sweep raced this one) during the review-and-fix window, ABORT auto-fix with reason `head_moved_during_fix`. The fixes were computed against code that's no longer at HEAD; pushing them would silently bypass review.
3. **PR is still MERGEABLE.** Re-fetch `gh api repos/keyboard-studio/keyboard-studio/pulls/<NUM> --jq .mergeable_state` and confirm it isn't `dirty` (i.e. CONFLICTING). Another PR may have merged into `main` between Phase 2 and now, making this PR conflict. ABORT auto-fix with reason `became_conflicting_during_review` and reroute to MENTION_ONLY (mirroring the Phase-2 CONFLICTING gate).
4. **PR is still not a draft.** From the same `gh api repos/keyboard-studio/keyboard-studio/pulls/<NUM>` response, assert `.draft` is `false`. The PR was non-draft at Phase 2 (or it would have been skipped there), so the crew ran — but converting it to draft *during* the review window is the author signalling they have pulled it back to rework. ABORT auto-fix with reason `became_draft_during_review`. **The triage never commits to a draft PR.** Unlike the other three gates, do **not** reroute to MENTION_ONLY: a draft is the author's active workspace, so skip the push *and* the comment, record an audit entry with `action_taken: skipped, reason: became_draft_during_review`, and move on. The crew's findings are preserved in the audit log; the next sweep re-reviews once the PR leaves draft.
5. **No fix proposal touches a manifest file.** Before dispatching `km-programmer`, check every fix proposal's `file` field against the manifest basenames — `**/package.json`, `**/pnpm-lock.yaml`, `**/pnpm-workspace.yaml`, or `**/package-lock.json` — and apply the rule inline (the prompt does not invoke any module at runtime; the single source of truth for this filename list is [utilities/km-triage-app/manifest-guard.js](../utilities/km-triage-app/manifest-guard.js), which any programmatic caller should `require()` rather than re-enumerate). If **any** proposal matches, ABORT auto-fix and reroute the **entire** findings list to MENTION_ONLY with reason `manifest_change_needs_human`. Rationale: manifest edits carry peer-dependency cascades and lockfile-consistency semantics a mechanical fix cannot safely resolve. A `package.json`-only change that leaves `pnpm-lock.yaml` stale satisfies every other gate yet breaks CI on the next `pnpm install --frozen-lockfile` (`ERR_PNPM_OUTDATED_LOCKFILE`). Routing to a human is the only safe response.

> **Sanctioned-override path (dormant).** Precondition 5 blocks ALL manifest fixes today; the auto-fix path never regenerates lockfiles under normal operation. If a future class of safe manifest fixes is ever explicitly sanctioned via an override, the km-programmer procedure must, after applying any `**/package.json`-touching fix, run `pnpm install --lockfile-only` from the worktree root and stage both the `package.json` and the resulting `pnpm-lock.yaml` in the same commit. If regen fails (network error, registry auth, peer-dep conflict), abort and reroute to MENTION_ONLY with reason `lockfile_regen_failed`. This path requires `pnpm` on the bot host (documented by km-programmer in the host setup). It is not the active default.

Checks 1–4 together cost one `gh api` call (the same one returns `.head.sha`, `.mergeable_state`, and `.draft`); run it once and reuse the result across those four gates. Precondition 5 is a path test over the fix-proposal list and needs no additional API call.

### Action: AUTO_FIX_ONLY (Phase 5.5 outcome)

Dispatch `km-programmer` once with the consolidated auto-fix list. **First run the Auto-fix preconditions above; only proceed if all five pass.** Briefing template:

```
You are applying auto-fixes from a km-triage sweep against PR #<NUM>.
Head branch: <HEAD> on keyboard-studio/keyboard-studio.

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
     WORKTREE=.escalations/worktrees/triage-fix-<NUM>-<HEAD_SHORT_SHA>
   (`.escalations/` is gitignored, so the worktree is invisible to git status.)
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
     git -C "$WORKTREE" push "https://x-access-token:$(node utilities/km-triage-app/mint-token.js)@github.com/keyboard-studio/keyboard-studio.git" "HEAD:<HEAD>"
10. Clean up the worktree:
     git worktree remove "$WORKTREE"
11. Post-condition (the triage runs this after km-programmer returns): assert BOTH of the following against the values recorded at sweep start.

    a. **HEAD SHA unchanged.** `git rev-parse HEAD` must equal the sweep-start HEAD SHA. If it differs: print `[CRITICAL] PR #<NUM> auto-fix appears to have bypassed worktree isolation — HEAD moved in main tree — sweep aborted` to stderr, record `action_taken: isolation_breach_head` in the audit log, append a critical note to `.escalations/INBOX.md` (format: `## [CRITICAL] Isolation breach on PR #<NUM> — HEAD moved\n<old SHA> -> <new SHA>`), and stop the entire sweep — do not continue to the next PR.

    b. **Porcelain/index/untracked set unchanged.** `git status --porcelain=v1 --untracked-files=all` must be byte-identical to the snapshot taken at sweep start. If it differs: print `[CRITICAL] PR #<NUM> auto-fix leaked stray index/untracked files into the main working tree — sweep aborted` to stderr, record `action_taken: isolation_breach_porcelain` in the audit log, append a critical note to `.escalations/INBOX.md` (format: `## [CRITICAL] Isolation breach on PR #<NUM> — working tree contaminated\nDiff:\n<lines that differ, prefixed with + or ->`) and stop the entire sweep — do not continue to the next PR.

    Both checks must pass. A clean main tree (nothing staged, no untracked files) has an empty porcelain output — that is the expected baseline for a scheduled sweep.
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

Then emit an `auto-fix` progress event so the dashboard records the push:

```bash
node utilities/km-triage-app/progress-emit.js \
  phase=auto-fix pr=<NUM> applied=<N> commit_sha=<new-head-sha> || true
```

When `km-programmer` returns ESCALATE (a fix failed to apply, or a check broke), treat the PR as if the action were MENTION_ONLY: post an @-mention comment listing the failed-to-apply fixes alongside their original specialist findings (use the same `node utilities/km-triage-app/bot-gh.js pr comment` pattern as MENTION_ONLY below), and add a follow-up audit-log entry with `action_taken: auto_fix_attempt_failed`.

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

Apply the same @-mention dedup and email-to-handle conversion rules as MENTION_ONLY (km-triage.md). Label `review-needed`.

Then emit both an `auto-fix` event (for the commit km-programmer landed) and a `mention` event (for the @-mention comment), in that order:

```bash
node utilities/km-triage-app/progress-emit.js \
  phase=auto-fix pr=<NUM> applied=<N> commit_sha=<new-head-sha> || true
node utilities/km-triage-app/progress-emit.js \
  phase=mention pr=<NUM> comment_url=<comment_url> directed_by=<directed_by> channel=<desktop|web|unknown> || true
```

## Pre-crew canaries — same story in both modes

Two mechanisms gate the LLM crew before or within the review itself; neither is identity-dependent, so both apply unchanged in personal mode:

- **Phase 2's `ci_not_ready` gate** (km-triage.md, checking `statusCheckRollup`) is plain `gh`/`jq` — no bot token needed. A PR whose required CI check hasn't gone green is skipped before any specialist is dispatched, in personal mode exactly as in bot mode.
- **km-verification** runs as one of the specialists dispatched by km-triage — it confirms whether the PR does what it claims. This runs identically whether you triggered it yourself or the cron did.

## Permissions

Run personal mode as an ordinary interactive slash command — **do not** pass `--dangerously-skip-permissions`. There is a human at the terminal to answer permission prompts; that is the whole point of this mode. (`--dangerously-skip-permissions` belongs only to the unattended scheduler wrappers, where the GitHub App permission ceiling, not the local prompt, is the safety boundary.)

## Orchestrator model

The km-triage **orchestrator** runs on a different model per track; the review specialists are unaffected (they keep `model: sonnet` from their agent frontmatter in both tracks):

- **Personal track → sonnet.** Run personal triage on sonnet — e.g. `claude -p "/km-triage <N>" --model sonnet`, or just switch your interactive session to sonnet before invoking `/km-triage`. This is convention, not enforced: in a bare interactive session the operator's current session model wins.
- **Server track → opus.** The scheduler wrappers ([scripts/triage-linux.sh](../scripts/triage-linux.sh), [scripts/triage-windows.ps1](../scripts/triage-windows.ps1)) default the orchestrator to opus. Override per-run with `KM_TRIAGE_MODEL`.

The **Hard safety rules** in km-triage.md (never merge, never rebase, never force-push, never mutate `main`, never close issues) apply in **both** modes, without exception.
