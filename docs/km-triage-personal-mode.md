# km-triage personal mode — interactive run under your own GitHub account

**The escape hatch for running `/km-triage` by hand.** The main triage doc ([.claude/commands/km-triage.md](../.claude/commands/km-triage.md)) is written for the unattended service: it authenticates as the `km-triage[bot]` GitHub App, mints installation tokens, and posts under the bot identity. That path requires a one-time `node utilities/km-triage-app/setup.js` to install the App on the machine. A teammate who just wants to triage a PR interactively from their own Claude Code session has no bot identity and should not need one.

**Personal mode** is that path. When active, the triage runs entirely under the operator's own `gh` auth (their PAT) and never touches the bot machinery. The mode-detection rules live in the main doc (section "Mode decision — bot vs personal"); this file holds everything about how a personal run behaves once the decision lands on personal.

Confirm `gh auth status` succeeds; if it doesn't, write the normal `auth_failed` audit line and stop (a personal run with no `gh` auth can do nothing).

## What changes in personal mode

| Mechanism (bot mode) | Personal-mode behavior |
|---|---|
| **Phase 1 reachability check** (`mint-token.js`, fast-fail `auth_failed`) | **Skipped.** No token is minted. |
| **`node utilities/km-triage-app/bot-gh.js <args>`** — every PR-mutating call (comments, label adds, the CONFLICTING / MENTION / ESCALATE comments) | **Replace with plain `gh <args>`.** Same arguments, your own PAT. Comments/labels are attributed to you, not `km-triage[bot]`. |
| **`check-progress.js`** check-run publication (Phase 4 create, Phase 6 completion, Pre-filter D `success`) | **Skipped entirely.** It mints a bot token and needs the App's `checks: write`; you don't have it. Observability degrades to the local `progress.jsonl` only. See "The merge gate in personal mode" below for what this means for merging. |
| **Auto-fix `git push`** via `https://x-access-token:$(mint-token.js)@github.com/...` | **Push with your own git auth:** `git -C "$WORKTREE" push origin "HEAD:<HEAD_BRANCH>"`. The commit is attributed to you. All auto-fix gates (head-not-protected, SHA-unchanged, still-mergeable, still-not-draft, no-manifest, worktree isolation) still apply unchanged. |
| **`progress-emit.js` / `audit-emit.js` / `sweep-init.js` / `cache-diff.js`** local helpers | **Unchanged** — pure local file/git operations, no bot token. Run `sweep-init.js` normally (its `gh label create` calls already use your own PAT in both modes). |

## The merge gate in personal mode

The `main` rulesets (verified live 2026-07-02) gate merges with a **required status check**, not a required review: ruleset `main: PR + review` (id 17331095) has `required_approving_review_count: 0`, and ruleset `main: CI + integrity` (id 17331134) requires the `build` check and the `km-triage/review` check-run to be `success` on the head SHA.

Personal mode cannot publish the `km-triage/review` check-run (no App credentials). So a personal-mode APPROVE-AND-PARK does **not** unblock the merge button by itself. The PR merges when either:

- a subsequent **bot-mode sweep** re-reviews the PR and publishes the check-run as `success` (the normal path — the label survives, and Pre-filter-style skip gates keep the re-review cheap), or
- a **repo admin** merges using the ruleset's admin bypass (`RepositoryRole` admin is the only bypass actor).

## APPROVE-AND-PARK in personal mode

On a clean approve, do what bot mode does minus the check-run:

- **Always** apply the `ready-to-merge` label (plain `gh`) and post a plain `gh pr comment` summarizing the specialists' verdicts (same body as bot mode, with a closing line noting it was a personal-mode run and that the `km-triage/review` check will be published by the next bot sweep).
- Optionally, if you are **not** the PR author, you may also submit `gh pr review --approve` as a visible record-of-decision. This is a courtesy, not a gate: `main` requires zero approving reviews (see above), so skipping it changes nothing about mergeability. If you **are** the author, GitHub blocks self-approval — just skip it; nothing is lost.

The merge itself is always a human click (per the Hard safety rules, the triage never merges); the point of always-tagging is that any team member, not only the tech lead, can be the one to click it.

All other actions (REQUEST-CHANGES, MENTION_ONLY, ESCALATE, auto-fix) behave identically to bot mode — only the wrapper changes from `bot-gh.js` to `gh`, and no check-runs are published.

## Permissions

Run personal mode as an ordinary interactive slash command — **do not** pass `--dangerously-skip-permissions`. There is a human at the terminal to answer permission prompts; that is the whole point of this mode. (`--dangerously-skip-permissions` belongs only to the unattended scheduler wrappers, where the GitHub App permission ceiling, not the local prompt, is the safety boundary.)

## Orchestrator model

The km-triage **orchestrator** runs on a different model per track; the review specialists are unaffected (they keep `model: sonnet` from their agent frontmatter in both tracks):

- **Personal track → sonnet.** Run personal triage on sonnet — e.g. `claude -p "/km-triage <N>" --model sonnet`, or just switch your interactive session to sonnet before invoking `/km-triage`. This is convention, not enforced: in a bare interactive session the operator's current session model wins.
- **Server track → opus.** The scheduler wrappers ([scripts/triage-linux.sh](../scripts/triage-linux.sh), [scripts/triage-windows.ps1](../scripts/triage-windows.ps1)) default the orchestrator to opus. Override per-run with `KM_TRIAGE_MODEL`.

## Safety

The **Hard safety rules** in the main doc (never merge, never rebase, never force-push, never mutate `main`, never close issues) apply in **both** modes, without exception. The destructive-action narration rule also applies: print the `[km-triage] about to <action> ...` line before every PR-mutating call — in personal mode this is exactly the beat that gives you, the human at the terminal, a chance to interrupt.
