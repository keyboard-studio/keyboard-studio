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

All other actions (REQUEST-CHANGES, MENTION_ONLY, ESCALATE, auto-fix) behave identically to bot mode — only the wrapper changes from `bot-gh.js` to `gh`.

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
