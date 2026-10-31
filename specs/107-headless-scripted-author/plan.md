# Implementation Plan: Headless scripted author for decision walks

**Branch**: `107-headless-scripted-author` (based on `main` after the spec 106 stack merged; PR targets `main`) | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/107-headless-scripted-author/spec.md](spec.md)

## Summary

Add a test-only **headless author** under `packages/studio/src/test/headlessAuthor/`. Given a case
description (the `harness/cases.json` shape), it walks the steps the product's own routing yields,
takes each decision by the walk policy (override, else top suggestion, else default, else the `zzq`
placeholder), writes it through the store actions the UI uses, and hands off to spec 106's replay
(`rebuildWorkingCopyFromStores` → `buildOutputBundle` → compile → `checkConsistencyGates`). Every
suggestion comes from a product function; logic that lives only in a component is lifted into a pure
function the component then calls.

**Governing rule (spec FR-013 to FR-017, SC-010): the author bypasses the UI and nothing else.**
Below the UI it runs the product's own unmodified code, at the seam the UI calls. Its own code is only
case input, the walk policy's choice, the `zzq` typing and reporting. The rule is enforced from the
first line of author code, not added at the end:

- `HA/boundary.test.ts` lands in Phase 2, before any step driver. It allows only inventoried product
  imports and fails on mocks and direct store writes.
- The depcruise rule `product-not-to-headless-author` keeps product code from depending on the author.

When the author cannot reach something, the plan's only moves are lift (FR-040) or Playwright-only
(FR-042).

Three run tiers share one runner:

| Tier | What | Where | Budget |
|---|---|---|---|
| PR set | 6 curated keyboards x 1 profile, plus parity on the 4 committed records, plus the drift guard | PR CI, the parallel job `headless-author` (`needs: changes`; gated on `e2e`), required via the ruleset | 0 wall time while within the `fast` + `build` chain (about 5.1 min); cap = T051's measurement + ~50%, rounded up, at most 5 min: measured 84-132 s, cap 4 min (SC-002) |
| 32-case suite | the committed canonical case file `cases/harness-cases.json` (FR-035) | on demand, and nightly | under 10 min (SC-008) |
| Wide sweep | eligible slice of `../keyboards` x profiles | weekly schedule, sharded; manual dispatch | not on PRs; failures filed as issues (FR-034) |

Timing is measured, not estimated, for the replay half (research R1). The author half (proposal calls)
was estimated at plan time, with a stated ceiling that task T051 measured on CI and that sets the job's
cap: the measured job time plus about 50% headroom, rounded up to a whole minute, at most 5 minutes.
T051 measured 84-132 s, so the cap is 4 minutes (research R3). All six cases stay unless the job would
exceed 5 minutes; only then is the set cut, weakest shape first, both regression guards kept.

## Technical Context

**Language/Version**: TypeScript 5 (repo pin), Node >= 22.19.0 (measured on Node 24.11.0)

**Primary Dependencies**: the studio's own stores (zustand), `@keyboard-studio/engine` (codec,
proposals, compiler service with `kmcmplib` WASM), spec 106 replay modules in
`packages/studio/src/test/`; vitest 4 with jsdom. No new runtime dependency.

**Storage**: none at runtime. Reports are written as test artifacts by the scheduled workflow only.

**Testing**: vitest under `packages/studio/vitest.corpus.config.ts` (the author needs `../keyboards`).
The PR set runs as its own corpus-config invocation in CI (research R3).

**Target Platform**: Node in CI (`ubuntu-latest`) and maintainers' machines (Windows included).

**Project Type**: test tooling inside the `@keyboard-studio/studio` package, plus behaviour-preserving
lifts of component logic into pure functions in the studio source.

**Performance Goals**: SC-001 (one case under 60 s cold, under 5 s warm per further case); SC-002
(PR lane is a parallel job, no added wall time, at most 5 min; cap 4 min from T051); SC-008 (32 cases under 10 min).

**Constraints**: the author bypasses the UI only and cannot diverge from product code below it
(FR-013 to FR-017; boundary test + depcruise rule, SC-010); no browser, dev server, port or network
(FR-008); deterministic (FR-007); no re-implemented proposal logic (FR-010, FR-011); the whole PR CI run under 10 min, preferably under 5
(owner ruling).

**Scale/Scope**: 6 PR-set cases; 32 harness cases; wide sweep over about 912 keyboards in the eligible tier
(921 parse; 9 too-large, R6), narrowed to the Latin slice by default.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | PASS | No `Pattern` or contracts type change. The author reads `cases.json`-shaped input that lives in test code. |
| II. KeyboardIR spine | PASS, with a design rule | The author drives the real scaffold, so a base the codec cannot parse fails the scaffold. The sweep MUST decide eligibility **before** scaffolding (from `docs/import-corpus.json` status plus a probe parse in the eligibility step), never by wrapping `parse()` or the scaffold in try/catch (research R6). |
| III. State model | PASS, mapping stated | The author writes the 088 DecisionSet through store actions and leaves a 053 record; the provenance mapping is in [data-model.md](data-model.md#provenance-mapping-088--053) (FR-004). It adds no second author-truth store (spec 105). |
| IV. Validator layering, one D3 cycle | PASS | The author calls replay's compile once per case; it adds no timer and no parallel validation path. |
| V. VirtualFS only | PASS | The studio code path still writes nothing to host disk; only test runners write report files. |
| VI. Team boundaries | PASS | Engine team: studio test tooling, studio components (lifts), CI workflow. No content-team artefact changes (pattern library, survey text, gallery ordering). Lifts move code, never wording or order. |
| VII. Out of scope | PASS | CJK/Ethiopic are skipped with the stub's reason (FR-032); no touch-first authoring; US6 only seeds touch through the existing desktop-to-touch path. |
| VIII. House conventions | FLAG (minor) | No emoji in runner output. Issue numbers must not appear in shipped code or comments: the author reuses spec 106's `KNOWN_GAPS` table rather than adding its own table. It does add two rows to it (G1 on `bj_cree_woods`; G6 on every touch-bearing keyboard walked, `walkOnly`), with owner strings in the table's existing style. The spec 106 table already uses `#2361`/`#2363` as owner strings, which is spec 106's call; the new rows are test code, not a spec 106 document. The scheduled workflow puts issue references only in issue bodies it files. |
| IX. Decision registry | PASS | No new survey surface. Step order comes from the product's routing (`steps/advance.ts`, `steps/reducer.ts`, the journey runner), never a stored list (FR-002). Lifts keep the component as the only renderer. |
| X. Defaults are proposals | PASS, one justified exception | The author confirms product proposals the way an author would, and records provenance as the UI does. The `zzq` placeholder is not a product proposal: it stands for an author typing a sequence, is recorded as `hand-set`, and is counted in every run report (Complexity Tracking). |
| XI. Done means integrated | PASS, conditions | Done = PR set wired into required CI (the `headless-author` job added to the `main: CI + integrity` required checks, T077), scheduled workflow live, lifted functions called by their components. A lift with no production caller is unfinished. The carve code the FR-040 lift moves is on `main` since #2369, so no lift is parked. |

**Personal data**: none — no new store, recipient, category, or telemetry. (The scheduled workflow
files GitHub issues containing keyboard ids, gates and decision points only.)

**Post-design re-check (after Phase 1)**: unchanged. The data model adds test-only types; the
contracts are test-runner interfaces and a CI workflow contract. No article verdict moved.

## Project Structure

### Documentation (this feature)

```text
specs/107-headless-scripted-author/
├── spec.md
├── plan.md              # this file
├── research.md          # R1-R10: timing, function inventory, CI placement, cadence, ...
├── data-model.md        # Case, walk policy, run report, parity allow-list, PR-set entry, provenance mapping
├── quickstart.md        # how to run each tier and what "green" looks like
├── contracts/
│   ├── author-api.md        # runAuthorCase() and the run result
│   ├── case-and-report.md   # case JSON, PR-set manifest, run report, sweep summary
│   └── scheduled-sweep.md   # the scheduled workflow: cadence, artifacts, issue filing
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
packages/studio/src/test/headlessAuthor/
├── caseTypes.ts              # Case, Override, PrSetEntry (test-only types)
├── cases/
│   ├── harness-cases.json    # canonical copy of the 32 harness cases (FR-035), byte copy
│   └── PROVENANCE.md         # source branch km/2302-walk-zips, commit a4bd8591, path
├── loadCases.ts              # reads cases/harness-cases.json (and same-shape files) and the PR-set manifest
├── walkPolicy.ts             # override > top suggestion > default > placeholder
├── placeholder.ts            # zzq<hex> + indicator j; clash detection
├── stepDrivers/              # one driver per step; each calls product functions only
│   ├── identity.ts  windowsLayout.ts  track.ts  inventory.ts  marks.ts
│   ├── outputForm.ts  tolerance.ts  convenience.ts  carve.ts  mechanism.ts
│   ├── displacement.ts  caps.ts (Phase F/help driver)  touchSeed.ts
├── runAuthorCase.ts          # routing loop -> drivers -> replay hand-off -> result
├── runReport.ts              # placeholders, displacements, skips, known gaps, fallbackPolicy
├── recordWriter.ts           # 053 record via the UI's recording path
├── eligibility.ts            # missing / not codec-clean / stub-routed / outside slice
├── parity.ts                 # DecisionSet vs record diff, normalisation, allow-list, stale check
├── parityAllowList.ts        # reviewed entries
├── prSet.json                # the curated PR set: case id (or inline case) + reason per keyboard
├── driftGuard.ts             # FR-010 function inventory for the drift-guard test
├── boundary.test.ts          # FR-014/FR-016: inventoried imports only, no mocks, no direct store writes, no KS_AUTHOR in product (default config)
├── authorCase.corpus.test.ts       # US1 cases (determinism, edge cases)
├── parity.corpus.test.ts           # US2
├── prSet.corpus.test.ts            # PR tier (US4 PR set) + SC-005 guard
├── harnessCases.corpus.test.ts     # US3, opt-in via KS_AUTHOR_HARNESS=1; reads cases/harness-cases.json
├── sweep.corpus.test.ts            # US4 wide sweep, opt-in via KS_AUTHOR_SWEEP
└── driftGuard.test.ts              # FR-011 (no corpus needed; runs in the default config)

packages/studio/src/...       # lifted pure functions next to their components (FR-040)
.dependency-cruiser.cjs       # new rule `product-not-to-headless-author` (FR-016)
.github/workflows/ci.yml      # new `headless-author` job: needs: changes, if: e2e, timeout-minutes 4 (T051; <= 5)
.github/workflows/headless-sweep.yml   # scheduled + dispatch: 32 cases nightly, wide sweep weekly
scripts/file-sweep-issues.mjs # dedupe-and-file for sweep failures
```

**Structure Decision**: everything that is only for testing lives beside spec 106's replay in
`packages/studio/src/test/headlessAuthor/`, so it shares `decisionPointFixture.ts` and
`consistencyGates.ts` without exporting test code from the package. Lifts land next to the component
they come from, as plain exported functions with their own unit tests.

## Phasing (each phase independently green; US1 first)

| Phase | Content | Green means | Depends on |
|---|---|---|---|
| 1 Setup | folder, types, canonical `cases/harness-cases.json` + `PROVENANCE.md` (FR-035), PR-set manifest skeleton, corpus-config wiring | typecheck + empty suites discovered | none |
| 2 Foundational | **boundary test + depcruise rule first** (FR-014, FR-016), then case loader, walk policy, placeholder, run report, eligibility, routing loop over the journey runner's routing, replay hand-off | boundary test and depcruise green over every `HA/` file; unit tests for each; the loop walks `basic_kbdus` with every driver taking the default through the step's own store action, and replay compiles | 1 |
| 3 US1 (P1) | step drivers + the FR-040 lifts US1 cannot walk without (carve Continue rule, mechanism order, S-02 identity, displacement order, case-pair companion, marks series assembly, text sample), and the later lifts; drift guard (FR-011) | `p1-whole-bafut-kbdus` runs headless, compiles, reports gates; byte-identical rerun; edge cases; drift guard green; lifted components' existing tests unchanged | 2 |
| 4 US2 (P1) | parity against the 4 committed records + on-demand records; allow-list; stale report | 0 unexplained differences on the 4 records | 3 |
| 5 US4a PR set + CI | `prSet.json` (6 keyboards), `prSet.corpus.test.ts`, the parallel `headless-author` job, timing check, then the owner's ruleset change (T077) | PR set green locally and in CI within SC-002; SC-005 revert check fails `bj_cree_woods` | 4 |
| 6 US3 | 32-case suite over the committed canonical case file | 32 cases report gates, placeholders, displacements; under 10 min | 3 |
| 7 US4b wide sweep + schedule | eligibility slice, sweep summary, `headless-sweep.yml`, issue filing | dispatch run completes, artifacts uploaded, a seeded failure files one issue and a rerun appends rather than duplicates | 6 |
| 8 US5 closure | lift audit (every FR-040 rule lifted or listed), Playwright-only list (FR-042), any rule the drivers still reach through a component | every FR-040 row resolved; component tests and golden walk unchanged (SC-006) | 3 |
| 9 US6 (P3) | touch seed driver, G6 headless, N/A reporting | G6 evaluated on camqwerty/camazerty; N/A on `bj_cree_woods` | 3 |
| 10 Polish | SC runs (timing, 5x flake, SC-005, SC-010 mutation check), docs/tooling.md section, spec 106 hand-off note | all SC evidence recorded | all |

Phase 5 can start as soon as Phase 4 is green, in parallel with Phases 6 and 8. No phase is gated on
code outside `main`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Art. X: the `zzq<hex>` placeholder is a value no product function proposes | Some decisions have neither a suggestion nor a default (a character the copied keyboard cannot place). A walk must still finish to reach the gates. It mirrors exactly what the Playwright harness types today, so parity with recorded walks holds. | Stopping the case at the first unproposed decision would hide every later gate failure; inventing a "better" scheme would break parity with the existing records and add a second placeholder convention. Each placeholder is recorded as `hand-set` and counted in the run report, so nothing is silent. |
| A second CI job (`headless-author`) for the PR set | Zero wall-time cost: it needs only `changes`, so it runs beside the `fast` -> `build` chain (about 5.1 min) and adds nothing to PR wall time while it finishes within that chain (SC-002); on CI it ended 2.9-3.7 min before `build` on every measured run (research R3). It is required through the ruleset, so it still gates merges. | A step inside `build` reuses `build`'s install but lengthens the longest chain by its own run time on every PR; a job that `build` needs puts max(headless, `fast`) + `build` on the chain. Both cost wall time; the parallel job costs only runner minutes. |
