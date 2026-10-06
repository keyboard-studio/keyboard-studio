---
name: speckit-round
description: Run exactly ONE round of the post-clarify Companion pipeline in this (fresh) session -- the plan step, the tasks step, or one implement phase -- then stop at a boundary the disk records. Driven by scripts/speckit_rounds.py, one new session per round; also usable by hand in a fresh chat.
compatibility: Requires spec-kit project structure with .specify/ and the companion extension
---

## User Input

```text
$ARGUMENTS
```

A feature directory (`specs/NNN-name`). If absent, use `.specify/feature.json`.

## What a round is

The pipeline after clarify is split into rounds. Each round runs in a **fresh
top-level session**, so it starts near-empty and can dispatch its own
subagents:

| Round | Work |
|-------|------|
| plan | `speckit-companion-plan`, fully |
| tasks | `speckit-companion-tasks`, fully |
| implement | ONE phase of `tasks.md`: the phase containing the next unchecked task |

All memory between rounds is on disk: `.spec-context.json` (step, status,
decisions) and the checkboxes in `tasks.md`. Nothing is carried in chat.
That is what makes a new session per round cheap. Orientation is one status
call plus the artifacts this round actually needs.

## Steps

1. **Resolve.**

   ```bash
   PYTHONIOENCODING=utf-8 python3 .specify/extensions/companion/scripts/status-context.py --feature-dir <feature_dir>
   ```

   `PYTHONIOENCODING` matters on Windows: under a cp1252 console the script
   fails to encode its arrows and silently drops the RESOLUTION line.

   Parse the final `RESOLUTION: {...}` line. If `complete: true`, end with
   `ROUND: COMPLETE`. If `empty: true` or the next step is specify/clarify,
   end with `ROUND: BLOCKED needs interactive specify/clarify`.

2. **Unattended.** No human is watching this round:

   ```bash
   python3 .specify/extensions/companion/scripts/write-context.py --feature-dir <feature_dir> --set unattended=true
   ```

   Review gates are recorded and passed, never waited on. State the
   RESOLUTION `decisions[]` as in-scope context for the step.

3. **Do the round's work by invoking the real command. Never re-enact it.**

   - **plan**: invoke `speckit-companion-plan <feature_dir>` and let it run
     to its `--advance`. Dispatch its per-area investigation workers as the
     skill directs.
   - **tasks**: invoke `speckit-companion-tasks <feature_dir>` and let it
     run to its `--advance`.
   - **implement**: invoke `speckit-companion-implement <feature_dir>` with
     this scope limit: **this round owns only the phase containing
     `nextTask`** (the `## Phase` heading above it in `tasks.md`; when
     `nextTask` is null, the first unchecked task). Within that phase,
     follow the skill exactly: wave order, join checks, worker dispatch,
     and `--close-task` or `--append` + `--materialize` for every task.
     Specify, plan and tasks did **not** run in this session, so no reading
     budget has been spent yet: dispatch per the skill's threshold. Once
     the phase's last task is folded, checkpoint it (step 4) and stop.
     Run implement's wrap-up **only** if no unchecked task remains anywhere
     in `tasks.md` after this phase. The wrap-up is the full gate via one
     worker, the capture `--batch`, living-spec accounting and
     `--mark-complete`. That wrap-up fires the `after_implement` hooks in
     `.specify/extensions.yml`: the km-lead review, then the km-archivist
     PR step. Let them run. They belong to the last round only.

4. **Checkpoint the phase (implement rounds only).** Once the phase's last
   task is folded, commit and push the phase's code on the feature branch.
   That makes every phase a rollback point other agents can see. This
   matches the repo's default ([CLAUDE.md](../../../CLAUDE.md), "Commit and push
   cadence"): a green phase is committed and pushed without asking.

   - **Where:** the checkout that holds the feature branch. That is the
     worktree from `git worktree list` whose branch is named for the
     feature (for example `C:/Github/keyboard-studio-086` on
     `086-context-normalization-group`). The driver starts the session
     there, so relative paths already land in the worktree. When you
     dispatch workers, give them that checkout's absolute path. Never
     commit on `main`. If no feature branch exists, end
     `ROUND: BLOCKED no feature branch to commit phase code to`.
   - **Test first, when there is something to test.** Run the tests the
     phase added or touched through each package's own config:
     `pnpm --filter <package> exec vitest run <paths>`. **Never run bare
     `vitest` at the repo root.** Its config has an empty `include`, so it
     finds nothing. Suites outside the workspace use their own scripts
     (`pnpm run test:nfd-tolerance-corpus`, the `/api` suite); see
     [docs/tooling.md](../../../docs/tooling.md#running-a-subset-of-tests).
     Always run `pnpm typecheck` and `pnpm lint`. Add `pnpm crew-lint` when
     the phase touched a `.claude/**/km-*` file. Run the full gate
     (`pnpm typecheck`, `pnpm -r test`, `pnpm lint`) instead when the phase
     touched `packages/contracts`, the codec, or is the last phase.
     - **Corpus-gated tests** need `../keyboards` at the CI pin
       (`KEYBOARDS_CORPUS_SHA` in `.github/workflows/ci.yml`). If a task
       names one, a `[WARN]` skip does not count as green.
     - **Studio UI tasks** that call for a Playwright walk need that walk's
       evidence.
     - **Docs-only phases** need no test run.
     - **Tests the plan says must fail first** may be red only inside their
       phase. By the checkpoint, the phase's own tests must pass.
   - **Red tests, or required evidence missing: no commit, no push.** End
     `ROUND: BLOCKED phase tests red: <failing tests>` or
     `ROUND: BLOCKED FAIL: unverified <why>`. Per CLAUDE.md, a phase whose
     gates are not green is not a success. If part of the phase is
     genuinely done, you may commit just that part. Leave the failing
     task's checkbox unchecked and put the diagnosis in the commit message.
     Then still end BLOCKED.
   - **Green:** stage everything (the spec folder included), commit, and
     push with an explicit refspec:

     ```bash
     git -C <worktree> add -A -- .
     git -C <worktree> commit -m "<prefix>(<area>): <phase title> (spec NNN TNNN-TNNN)" -m "<one line per task: id + what it did>"
     git -C <worktree> push -u origin HEAD:refs/heads/<branch>
     ```

     - **Title:** use the repo style from CLAUDE.md: `feat`, `fix`, `docs`,
       `chore`, `maint` or `refactor`, with the smallest area that locates
       the change.
     - **Separate commit for unblocking work.** Out-of-scope work that
       unblocks the phase, such as repairing a shared test helper, gets its
       own commit.
     - **Attribution:** end the message with your harness's commit
       attribution line, if it defines one.
     - **No close keyword** (`close`, `fix`, `resolve` and their forms)
       directly before an issue number in a phase commit. Issues close when
       km-archivist opens the PR and it merges, per the issue-closure
       policy, not per phase.
     - **Hooks:** never `--no-verify`.
     - **Push:** always use the explicit `HEAD:refs/heads/<branch>` refspec.
       A branch cut straight from `origin/main` tracks `origin/main`, so a
       bare `git push` would target main. Never force-push. Never merge a
       PR. If the push is rejected, end `ROUND: BLOCKED push rejected: <reason>`.
   - **The spec folder rides with the branch.** `specs/<feature>/` lives on
     the feature branch next to the code and reaches main only when the PR
     merges. The driver also commits and pushes it on the branch after every
     round (`scripts/speckit_git.py`). Round logs (`specs/<feature>/rounds/`)
     stay local through the folder's `.gitignore`. Running a round by hand,
     without the driver? Finish with `python3 scripts/speckit_git.py sync <feature_dir>`.

   Put the commit sha in your `ROUND: DONE` line.

5. **Honour the project's CLAUDE.md.** It binds this session and every
   worker you dispatch. In keyboard-studio, these stop a round:
   - **Schema changes.** A `Pattern` schema rename, type change or removal,
     or reopening a resolved decision (D1–D9), needs the user. End
     `ROUND: BLOCKED needs user: <what>`. Never change the schema silently.
   - **A new timer that validates** needs D3 sign-off. Same BLOCKED ending.
   - **Out-of-scope work.** Anything on the spec §16 list: end BLOCKED
     rather than implement it.

   These must hold in the phase's diff:
   - No GitHub issue numbers in shipped code or comments.
   - A row in [docs/keyboard-index.md](../../../docs/keyboard-index.md) for
     any newly referenced keyboard.
   - Accessibility rules for studio UI.
   - i18n message-id grammar.

6. **Stop.** Do not start the next step or the next phase, even if context
   remains. The driver starts a fresh session for it.

## Final line (the driver parses it)

End your last message with exactly one of:

```text
ROUND: DONE <one-line summary: step or phase, files touched, tests, commit sha>
ROUND: COMPLETE
ROUND: BLOCKED <reason>
```

`BLOCKED` is for things a new session cannot fix by trying again:
- a scope question for the developer;
- unverifiable work;
- a repeated worker failure;
- a broken environment.
