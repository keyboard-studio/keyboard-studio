# Working Agreement

> Norms for the keyboard-studio sprint. Revisit on a rolling basis as the project evolves.
> Resolves [#7](https://github.com/keyboard-studio/keyboard-studio/issues/7).

## Teams and Members

| Team | Lead | Members |
|------|------|---------|
| Content | Doug Higby (@DougHigby) | Cooper, Jordan, Kevin |
| Engine | Matthew (@MattGyverLee) | Grace |

## Daily Standup

- **Time:** 9:15 CDT (10:15 EDT) — Matthew and Kevin are CDT; all others are EDT
- **Duration:** 30 minutes Mon-Fri; **1 hour on Mondays**
- **Format:** Three questions: What did I do yesterday? What am I doing today? Any blockers?
- **Channel:** Slack
- **Async fallback:** If you can't attend, post your three answers in Slack before the standup starts

## GitHub Workflow

- **Issue tracker:** [MattGyverLee project board](https://github.com/users/MattGyverLee/projects/1/views/2) — all features tracked here
- **Branches:** One branch per issue; name it with the issue number (e.g. `feature/123-short-description`)
- **PRs:** Submit a PR when your branch is ready; Matthew reviews and decides how to merge
- **Branch protection:** Non-contract PRs require 1 approval before merge

## Contract and Schema Changes

Any change to `packages/contracts/` or the Pattern schema YAML shape requires:

1. PR labeled `area:contracts`
2. Approval from **both** leads (Doug and Matthew) before merging
3. Migration note in the PR body explaining cross-team impact

## End-of-Day Progress Sharing

- Each team shares tangible progress in Slack before end of day
- "Demoable" means a screenshot or short video clip — not hours logged

## Escalation

If a blocker is unresolved for more than 4 hours, post a comment tagging both leads (`@DougHigby` and `@MattGyverLee`) in the relevant GitHub issue or PR.

## Acceptance Criteria (from issue #7)

- [x] Standup time agreed and posted (9:15 CDT / 10:15 EDT)
- [x] Communication channel agreed (Slack)
- [x] Norms documented in this file
- [ ] Both leads acknowledge this agreement
- [ ] First standup held on Day 1 at 9:15 CDT
