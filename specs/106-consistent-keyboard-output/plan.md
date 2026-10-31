# Implementation Plan: Consistent keyboard output from base + decisions + carve

**Branch**: `106-consistent-keyboard-output` (stacked on `km/s02-deadkey-purpose` / PR #2358) | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/106-consistent-keyboard-output/spec.md`; evidence and rulings in
[source-plan.md](source-plan.md) (the original plan note); code facts in [research.md](research.md).

## Summary

Make the downloaded keyboard a faithful function of the starting keyboard plus the author's decisions:

- marks guards reach the artifact;
- every output follows the one output-form decision;
- carve drops rules that assignments made unreachable;
- caps handling becomes a visible decision;
- contexts accept NFC and NFD by default;
- the emitted `.kmn` is grouped and named;
- proposals are pre-selected.

All new behaviour lands in the **projection** (`projectWorkingCopyVfs`) or the engine's assignment
emitter. Nothing becomes a second author-truth store. Verification is primarily through
**decision-point fixtures**: a corpus base plus a `DecisionSet` cut at a decision point, run through the
real download path, compiled, simulated and gate-checked. The 32-case UI walk is the end-to-end gate.

## Technical Context

**Language/Version**: TypeScript 5.x, Node >= 22.19 (pnpm 9 monorepo)

**Primary Dependencies**:

- `@keyboard-studio/contracts`
- `@keyboard-studio/engine`: codec, pattern-apply, marks, simulator, compiler (kmc-kmn WASM)
- `@keymanapp/keyboard-lint` (context tolerance)
- studio: React, zustand, Lingui

**Storage**: None new. Decision values sit in the existing decision store and draft envelope (Art. III).

**Testing**: vitest per package. Decision-point fixtures are `*.corpus.test.ts` under
`vitest.corpus.config.ts` and read `../keyboards`. Playwright harness `tools/testing-profiles-2302`
(walk branch `km/2302-walk-zips`) is the E2E gate.

**Target Platform**: Browser SPA (studio). Engine runs in browser and Node.

**Project Type**: Monorepo web app + library.

**Performance Goals**: The projection stays within the existing D3 300 ms cycle on Bafut-sized
keyboards. New steps are parse/emit passes like 2.7.

**Constraints**:

- The `Pattern` schema stays untouched (Art. I), so variants are new pattern ids.
- No second debounce timer (Art. IV).
- No host-disk writes (Art. V).
- Proposals stay visible (Art. X).

**Scale/Scope**:

- 4 base keyboards x 1 profile record x 5 decision points = 20 fixtures (G6 is walk-only).
- 32 walk cases.
- About 8 PRs.

## Constitution Check

*GATE: passes. Re-checked after design below.*

| Article | Status | How |
|---|---|---|
| I Pattern schema | PASS | No `Pattern` field change. Base-plus-mark S-02 and postfix compose are **new pattern ids** (`deadkey_single_tap_nfd`, `postfix_compose`); the engine's S-02 merge keys on a set of ids (research R4). The only contracts edits are additive optional fields on non-Pattern types: `MarksContextToleranceDecision.origin`, plus the caps value type. Each gets its zod mirror in the same commit. |
| II IR spine | PASS | New steps parse, transform the IR and emit, as 2.7 does. The claimed-inputs filter works on IR node ids. |
| III State model | PASS | No new store. Caps, carve defaults and tolerance default are decision values. Provenance mapping between the 088 set and the 053 record: `default` → `tool-proposed`; `asked` → `hand-set`; `extracted` → `base-derived`. |
| IV Validator / D3 | PASS | No new timer. The adapt caps simplification check runs at proposal time, on demand, inside the existing compile service. |
| V VFS only | PASS | Fixtures run in memory. Walk zips are harness output, not authoring. |
| VI Teams | Engine-led | Engine owns projection, emitter, scaffolder, studio. Content owns the two new pattern YAMLs and the S-03 comment trim; content review is required on those files. |
| VII Out of scope | PASS | Touch deadkeys are excluded (handoff ruling 6). No CJK/LDML. |
| VIII Conventions | PASS | No issue numbers in code. Commit titles use `prefix(area)`. |
| IX Registry | PASS | `caps-handling` is declared as a gallery module with `provides`/`requires` (FR-050). The space column is an answer inside the existing marks station. |
| X Proposals | PASS | Every default (carve discards, cased-keys, tolerance, pre-selected chip, companion) is shown as default with change/keep, and none applies without the author's Continue or Accept. The tolerance default is recorded on the station's Continue, not on render. Adapt simplification is offered, never applied. |
| XI Integrated | PASS | Every story is wired through both preview and download (FR-005) and is reachable in the live walk. The walk gate is the integration proof. |

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.*

## Project Structure

### Documentation (this feature)

```text
specs/106-consistent-keyboard-output/
├── spec.md
├── plan.md              # this file
├── research.md          # R1-R10, km-keyman ruling R5
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── consistency-gates.md
│   └── decision-point-fixture.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/engine/src/
├── pattern-apply/applyAssignments.ts      # outputForm seam, comment dedup, mechanism ordering (US3, US7)
├── pattern-apply/applyAssignmentsToVfs.ts # thread outputForm
├── pattern-apply/mark-guards.ts           # per-mark notany rule, allowed contexts, buffer start (US2)
├── marks/output-form-policy.ts            # outputFormString helper (US3)
├── marks/worklist.ts                      # allowedContexts (space) (US2)
└── scaffolder/scaffold-ir.ts              # stop silent &CasedKeys insert; export family constants (US5)

content/patterns/desktop-input/
├── deadkey-single-tap-nfd.yaml            # new (US3)
├── postfix-compose.yaml                   # new (US3)
└── multi-char-sequence.yaml               # one-line comment (US7)

packages/studio/src/
├── lib/projectWorkingCopyVfs.ts           # steps 2.6 guards, 2.8 caps, claimed-inputs carve (US2, US4, US5)
├── lib/projectionInput.ts                 # NEW shared input builder (FR-005)
├── lib/serializeWorkingCopy.ts            # use projectionInput
├── hooks/useWorkingCopyTransform.ts       # use projectionInput
├── lib/claimedInputs.ts                   # NEW (US4)
├── survey/slotOccupancy.ts                # S-02 trigger + altgr escape slots (US4)
├── survey/marks/AttachmentStation.tsx     # space column (US2)
├── survey/questions/gallery/marksTreatment.ts  # apply -> {} (US2)
├── survey/questions/gallery/capsHandling.ts    # NEW module (US5)
├── survey/caps/CapsHandlingStep.tsx       # NEW renderer (US5)
├── editors/carve/CarveGalleryV2.tsx       # suggested discards as approvable default (US4)
├── survey/carve/carveValue.ts             # derived provenance, suggestion fingerprint, displaced chars (US4)
├── editors/assignLoop/MechanismGallery.tsx # pattern by form, named deadkeys, preselect, punct demotion (US3, US4, US7, US8)
├── survey/marks/ContextToleranceStation.tsx # default-accepted (US6)
├── components/rules/DemoPane.tsx          # plain diagnostics (US7)
└── test/decisionPointFixture.ts           # NEW harness (US1)
    + lib/__fixtures__/decision-points/<base>/<profile>/<point>.decisions.json

tools/testing-profiles-2302/               # on km/2302-walk-zips: gates G1-G7, no zzq (US8)
```

**Structure Decision**: The existing monorepo layout is kept. New pure helpers live beside their callers.

## Delivery sequencing (one PR per row; one commit per phase gate)

| Order | Story | Branch | Depends on |
|---|---|---|---|
| 1 | US1 fixtures + FR-005 shared projection input | `106-consistent-keyboard-output` (this branch) | #2358 |
| 2 | US2 mark guards | `km/106-mark-guards` | 1 |
| 3 | US3 output form | `km/106-output-form` | 2 |
| 4 | US4 carve | `km/106-carve-claimed` | 3 |
| 5 | US5 caps | `km/106-caps-handling` | 3 (case-pair seam) |
| 6 | US6 tolerance default | `km/106-tolerance-default` | 2, 3, 4 |
| 7 | US7 clean rules | `km/106-clean-rules` | 3, 4 |
| 8 | US8 preselect + 32-case walk | `km/106-preselect-walk` | all |

US1 lands first with **expected-failure** gate assertions (`it.fails`) for gaps E1-E7. Each later story
flips its own assertions to passing. The flip is that story's proof.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Two new pattern ids instead of a fragment variant field | Art. I locks `Pattern` | A variant field is a schema edit needing a joint session and a major bump |
| A test-only `recordToDecisionSet` converter | Fixtures come from real walk records | Hand-writing 40 DecisionSets from scratch loses fidelity to what authors did |
| Projection steps 2.6 and 2.8 (two more parse/emit passes) | Spec 105: behaviour lives in the projection | Writing guards and caps into the working IR is dead for the artifact (E1) |
