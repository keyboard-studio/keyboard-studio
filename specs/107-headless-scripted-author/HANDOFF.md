# Spec 107 handoff (2026-10-31)

For the agent continuing spec 107. `tasks.md` checkboxes and their **As built** notes are accurate;
read those before anything else. Everything below is pushed.

## Where things are

- **Update (2026-10-31, after merge):** PR #2410 merged and its branch is deleted. T051, T052 and
  T073 are closed on branch `km/107-ci-cap` (cap `timeout-minutes: 4`; research R3), and so is T062
  (sweep dispatched; see its As built note). 79 of 80 done; only T077 (owner) is open.
- Worktree `D:/Github/_Projects/_KM/ks-107-resume`, originally branch `107-headless-scripted-author`.
- At merge, 75 of 80 tasks done. Every phase gate is green locally:
  - US1 (`authorCase`) 26/26;
  - parity 17/17 on the 4 records;
  - PR set 6/6;
  - harness 32/32;
  - spec 106 `decisionPoint.corpus` 189 + 12 expected-fail;
  - default-config suites;
  - `pnpm lint` (0 errors); studio and engine typecheck.

## Open tasks (owner only)

| Task | What | How |
|---|---|---|
| T077 | Make `headless-author` a required check | **Owner/admin only**. Precondition met: green on `main` in run 41220294641 |

## What this session found and fixed (product defects the author exposed)

Each defect has its own commit on this branch (FR-012/FR-017: fixed product-side, never in the author):

- `3e56aefc`, `9a73eb46`: duplicate carve-suppression guards. Superseded by main's carve dedupe
  (see the Merge section below); `carveSuppression.ts` is main's. One commit covered paired stores, the
  other distinct rules over identical stores.
- `0352fae9`: quote characters in pattern slots broke KMN literals (kbdus `'` on RAlt).
- `3d2f3680`: synthesized rules were emitted at the end of their group on fragment-bearing keyboards
  (bj_cree_woods).
- `117475d9`: copying a keyboard lowered its `&VERSION` to 14.0 (chechen_latin).
- `c3018773`: consistency gates G4/G8 now attribute starting content per item.
- `83594f79`: the decision-point replay now drops a stale tolerance decision as the product does,
  instead of throwing.

Issues filed for what was not fixed here:

- #2392 spec 106 US6 (owns camqwerty G2);
- #2395 accepted tolerance normalization dropped after later steps;
- #2396 exemplar seeding ignores the target script;
- #2397 dead rule after carving a whole `any()` store. Fixed on main by `089eb37a` (merged here):
  G1 holds on bj_cree_woods and its KNOWN_GAPS row is removed. The issue can close;
- #2400 G6 vs touch reachability (owns the walkOnly G6 row);
- #2403 synthesized kvks breaks the schema;
- #2404 eo_plus `outs()` order;
- #2405 parseKps script default;
- #2406 large-keyboard performance.

## Decisions made this session (owner rulings)

- **Author name.** No `Case` field. Parity's tester-typed rule compares on presence where the
  author's PolicyStep is `placeholder` (research R8).
- **Parity compares records, not live state.** Both sides go through `recordToDecisionSet`, because
  the punctuation step keeps seeding the draft after `character-inventory` is recorded.
- **camazerty tolerance.** The product publishes `failed` and continues (no throw); the author
  mirrors it, and G2 is owned by `#2363`.
- **KNOWN_GAPS rows added by the author.** G1 bj_cree_woods (#2397, since removed); G6 on touch-bearing keyboards
  (#2400). The G6 row is `walkOnly` (`ownerOf(..., { walked: false })` in the decision-point replay).
- **Sweep `too-large` skip.** `MAX_SWEEP_RULE_COUNT = 2000` (measured; excludes 9 of 921), only in
  the `latin`/`eligible` tiers.
- **Sweep hangs.** The report is rewritten before and after each case, and a killed shard reports
  its case as `hung`.

## Merge of main (2026-10-31)

main moved under the author; two merges (`45b9aee6`, `1fd359d6`) bring the branch up to date.

- **Marks.** The guard question is gone (main `874b44b1`, start-of-line box). The guard lifts
  had no production caller left and are deleted; `startOfLineImportSeeded` / `startOfLineSeed`
  are the new lifts. The four records still carry the walker's guard answer: allow-listed as
  `record-age:origin/main 874b44b1`. T044 now treats an allow-listed decision as covering the
  agency of every survey answer its recorded value carries.
- **Carve.** main's LHS dedupe, key-side-only guards and whole-store removal supersede this
  branch's `3e56aefc` / `9a73eb46`; `carveSuppression.ts` is main's.
- **Inherited from main, not this branch:** `gateCoverage.test.ts` fails on main's own CI
  (`build`), and `battery.drift.test.ts` fails on Windows only (path separators).

## Residuals worth knowing

- **Mechanism driver.** It keeps one local rule: a later accepted proposal wins, and null leaves the
  slot. The gallery gets this from React state setters, so a lifted copy would have no production
  caller (T064 note).
- **Timed-out sweep case.** Its walk keeps running on shared stores, so the case after a timeout is
  less trustworthy. There is no cancel.
- **Console output.** vitest hides console output from passing tests. Use
  `--silent=false --reporter=verbose` to see harness and PR-set case reports.
- **Debugging.** `KS_AUTHOR_TRACE=1` prints per-step timings; `KS_AUTHOR_CASE_TIMEOUT_MS` raises the
  per-case timeout.

## Gotchas (still true)

- `boundary.test.ts` and `driftGuard.test.ts` are never relaxed: lift or inventory instead.
- An inventory entry needs a real production caller and an author file that imports it.
- Only `stepDrivers/` may import proposal functions.
- Never run root `pnpm build` (it rewrites generated JSON).
  - After changing the engine, run `pnpm --filter @keyboard-studio/engine build`.
- On Windows, a `timeout`-killed vitest leaves orphan node workers. Stop only the PIDs you started.
- Parallel agents in one worktree clobber each other's scratch tests: use unique file names.
