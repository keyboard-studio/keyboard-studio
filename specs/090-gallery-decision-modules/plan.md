# Implementation Plan: Gallery Decision Modules (specs/090-gallery-decision-modules)

**Branch**: `km/gallery-decision-modules` (stacked off `km/decision-apply`, per the owner's
series ruling: each spec branch off the previous spec's branch, implemented in order without
waiting for merges) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/090-gallery-decision-modules/spec.md`; series plan
in [088 HANDOFF.md](../088-modular-decisions/HANDOFF.md); predecessor specs
[088](../088-modular-decisions/spec.md) (decision store) and [089](../089-decision-apply/spec.md)
(`apply` + the patch runner + the golden walk).

## Summary

The fourteen decisions that today exist only as `settles: [...]` strings in
`steps/stepDependencies.ts` get real modules. Each is a `QuestionModule` (the type 087/089
already built on) registered in the one registry, declaring the same `requires` its step
declares today, with the existing step component as its `renderer` — look unchanged — and an
`apply` that owns every write the component, its adapter, and the step's reducer hooks make
today. Working-copy overlays become the **values** of their decisions; the overlay fields
themselves survive until 093 as an applied view written only by `apply`. The in-place IR
rewrites (MARKS guards, context tolerance, deadkey ops, R1 `lockDesktop`, R2
`setTouchLayoutJson`) move inside `apply`. `phaseBDraftStore` and the gallery answers in
`surveyAnswerStore` are deleted. Every decision records a decision-log entry on completion,
closing the HANDOFF G7 gaps.

The work lands as **one PR per user story** (the spec's own slicing), in story order, and
every PR ends with the same gate: 089's golden walk byte-identical (research R7). US1 and US2
are P1; US3–US5 are P2 and independently landable. US5 (log entries) is sequenced last because
its acceptance (SC-003, exactly one entry per decision) is only measurable once all modules
record through the decision path.

No new stack choices: TypeScript + React + the existing zustand stores, vitest per package,
Playwright for the golden walk, pnpm 9 / Node ≥ 22.19.

## Technical Context

**Language/Version**: TypeScript (repo toolchain), React, Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: existing only — `packages/studio` stores (zustand), the 087 decision
registry (`survey/questions/registry.ts`, `decisions/orderDecisions.ts`), 089's `apply` runner
(`applyMutatePatch` + declared-`writes` check), `projectWorkingCopyVfs` projection pipelines.
No new dependency.

**Storage**: `decisionStore` (088) is the only record of gallery answers; drafts ride its
`decisions` slice (088 FR-007, DRAFT_VERSION 2). Working-copy overlay fields persist as the
applied view until 093.

**Testing**: vitest through each package's own config (never bare at root); module contract
suites; frozen-stores determinism tests for `apply` (SC-005); Playwright golden walk (089
SC-001) byte-identical per story; the pre-existing StepHost golden-walk parity test stays green.

**Target Platform**: the studio SPA in `pnpm dev` / production build — every success criterion
is measured in the live app or through the real `StepHost` (087's lesson, carried by the series).

**Constraints**: no `packages/contracts` change (the contracts-owned `CarveDisposition` type is
consumed unchanged); no new timer (D3 untouched — `apply` runs at commit, validation stays in
the existing cycle); no i18n message-id change; no visual change to any renderer; every answer
is still saved the moment it is given (a renderer's `onChange` fires at the same commit points
its store writes fire today).

**Scale/Scope**: 14 decisions / 14 steps, ~20 component/adapter/reducer write sites
(research R1's verified table), 1 store deleted (`phaseBDraftStore`), 1 store narrowed
(`surveyAnswerStore`), 5 reducer-side rewrites moved into `apply`.

## Owner decisions carried into this plan (verbatim; rulings recorded 2026-10-06)

- **Carve per-item provenance — RULED (owner ruling 2026-10-06, km-lead proposals Q4):**
  Candidate A — flat per-item enum `{ provenance: asked | derived | extracted }` for the
  removal-set items; `carveDispositions`' existing spec-076 provenance rides unchanged.
  tasks.md T003 records the ruling (resolved — no longer a choice point); the `carved-layout`
  removal-item shape in data-model.md is marked RULED, and US3's T030/T032 proceed against it
  when their turn comes.
- **Renderer literal — RULED (owner ruling 2026-10-06, km-lead proposals Q5):** rename
  `"default"` → `"question"` per FR-001 (research R3/Q2 resolved). T004 proceeds with the
  rename; the keep-`"default"` alternative is rejected under the ruling.
- **`phaseAnswersByStep` retirement — RULED (owner ruling 2026-10-06, km-lead proposals
  Q8):** 090 deletes it, as the tail task T063 sequenced after US4. Its residue is gallery
  answers that become decision values in this spec; 088's T016/T017 were stopped on a
  falsified premise, and 088's duplication ledger is corrected to "retired by 090."
- Series stacking (owner, 2026-10-06): each spec branch off the previous spec's branch,
  implemented in order without waiting for merges — hence this branch off `km/decision-apply`,
  and per-story PRs that target this spec's branch / retarget as the stack lands.
- From the 088 HANDOFF, binding on the series: decisions are the only stored state and the
  keyboard is derived from them; values from the starting point are defaults the author
  knowingly confirms, changes or overturns — never applied silently (090 records provenance;
  live extraction itself is 092); no change to the Pattern schema or `packages/contracts` —
  if a change starts to reach contracts, stop and check with the owner; i18n ids don't change.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design — see the bottom of
this section.*

| Article | Assessment |
|---|---|
| I — Pattern schema locked | PASS — no Pattern field, no `packages/contracts` file is touched. `CarveDisposition` (contracts, spec 076) is consumed as-is inside `carved-layout`'s value. |
| II — KeyboardIR is the engine spine | PASS — every IR effect runs as a patch over the typed IR through the mutate seam; opaque `RawKmnFragment` constructs are never survey-edited (carve removals that name them behave exactly as today's overlay does). |
| III — Single persistent working copy | PASS — one working copy; 090 changes *who may write it* (only `apply`, via the runner), not how many copies exist, and adds no serialization. |
| IV — Validator layering / D3 | PASS — no new debounce timer, no parallel validation path. `apply` runs synchronously at decision commit, outside the 300 ms validation cycle, like today's reducer handlers. |
| V — VirtualFS only | PASS — no host-disk writes; the projection still reads the (now applied-view) overlays. |
| VI — Team boundaries | PASS — Engine owns the registry, modules, runner wiring, and stores. Content-owned surface (gallery ordering, prompt/help copy, i18n catalogs) is untouched; renderers keep their look and copy. |
| VII — Out of scope for v1 | PASS — none of the §16 exclusions is implemented; the three-group "not yet supported" stub is untouched. |
| VIII — House conventions | PASS — commit/PR titles in the locked `<prefix>(<area>)` vocabulary; no issue numbers in shipped code; no emoji in console output; per-story PRs record their gate results in the PR body. |
| IX — No survey surface outside the decision registry | PASS, and it is the point of the feature — every gallery/picker surface gains its registry declaration (`provides` / `requires`, `gatedBy` where conditional: `touch-seed-source` keeps its asked-while-unrecorded gate) as a functional requirement (FR-002). Transitional note: `stepDependencies.ts` keeps its `settles` strings during 090, now redundant with the modules' `provides`; the step order is still derived by the same single sort, the parity tests pin module declarations equal to the step declarations, and 091 deletes the file. No new hand-maintained order list is introduced. |

**Post-design re-check:** the Phase 1 design (research.md, data-model.md) introduces no
exception — the gallery host reads `module.renderer`, which Article IX's registry already
anticipated (087's `DecisionRendererProps` contract); the FR-003 enforcement layers ride the
existing lint chain (`pnpm depcruise` + ESLint). No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/090-gallery-decision-modules/
├── spec.md          # feature specification (existing)
├── plan.md          # this file
├── research.md      # Phase 0: verified write-site table, R1–R8 decisions, open questions
├── data-model.md    # Phase 1: module shape, the fourteen decisions and their values
└── tasks.md         # Phase 2: per-story phases, one PR per story
```

### Source code (where the implementation will land — not in this planning change)

```text
packages/studio/src/
├── survey/questions/gallery/        # NEW: one module file per gallery decision
│   ├── windowsLayout.ts  baseKeyboard.ts  characterInventory.ts  marksTreatment.ts
│   ├── punctuationInventory.ts  invisiblesInventory.ts  retainedConvenienceChars.ts
│   ├── carvedLayout.ts   deadkeysDefined.ts  ruleSet.ts
│   ├── physicalLayout.ts touchSeedSource.ts  touchLayout.ts  helpDocs.ts (host/log only, R3/Q3)
│   └── *.test.ts                    # contract + apply-determinism tests beside the modules
├── survey/questions/registry.ts     # registers the gallery group; decisionIndex gains the 14 providers
├── survey/questions/b/pb_character_inventory.ts   # RETIRED into characterInventory (R2)
├── steps/galleryHost.tsx            # NEW: first runtime reader of module.renderer; records the
│                                    # decision and runs apply through 089's runner
├── steps/stepDependencies.ts        # settles strings become redundant (deleted by 091); parity-pinned
├── steps/reducer.ts                 # MARKS / R1 / R2 handlers retire as their applies land
├── stores/phaseBDraftStore.ts       # DELETED (US2)
├── stores/surveyAnswerStore.ts      # narrowed to within-step view position (US1/US2)
├── stores/workingCopyStore.ts       # overlay fields become applied-view; undoStack re-pointed (R5)
├── editors/... survey/...           # the existing components, as renderers: same look, writes removed
└── decisions/galleryWriteAudit.test.ts  # NEW: FR-003 call-site checker (R4 layer 2)
.dependency-cruiser.cjs              # FR-003 layer 1: module/apply files may not import stores (R4)
eslint.config.mjs                    # FR-003 layer 2: restricted write-action call sites in renderer trees
```

**Structure Decision:** modules live with the question modules (one registry — research R2),
not in a new `decisions/` module tree; the heavy patch constructions stay in their current
homes (`deadkeyWrite.ts`, the carve pipeline in `projectWorkingCopyVfs.ts`, the marks guard
functions) and are *called by* `apply`, so the byte-identical golden walk compares the same
code paths before and after. The per-step adapters in `editors/adapters/panelAdapters.tsx`
shrink to host wiring and are deleted per story as their step migrates.

## Implementation strategy

1. **Foundational first** (blocks all stories): the FR-001 renderer-props extension, the
   gallery host, depcruise layer 1, the registry group skeleton with the FR-002 coverage test
   (all fourteen ids, exactly one provider each), and the recording of the owner's carve
   provenance ruling (T003 — RULED 2026-10-06, km-lead proposals Q4: Candidate A; no story
   waits on it).
2. **Stories in spec order, one PR each**: US1 small pickers → US2 alphabet & inventories
   (deletes `phaseBDraftStore`) → US3 carve/deadkeys/rules (carve value shape RULED —
   T003 / km-lead proposals Q4) → US4 mechanisms & touch, followed by the
   `phaseAnswersByStep` deletion tail task (T063; owner ruling 2026-10-06, km-lead
   proposals Q8) → US5 log entries (last; its SC-003 check spans all steps).
   `help` is split by the 089/090 boundary (research Q3): 089 owns the flow applies; US5's host
   registration + log entry for `help-docs` lands with the log work.
3. **Every story** re-verifies its research R1 rows against the landed 088/089 code as its
   first task (the table was verified pre-088), migrates its components, extends the FR-003
   identifier list in the same change, and ends with the full gate of research R7: golden walk
   byte-identical, StepHost golden-walk parity green, package suites + `tsc` + lint green.
   A story whose gate is not green does not land, and its PR is not opened.
4. **MVP** is US1: three small pickers prove the host, the registry group, and the enforcement
   layers end-to-end on the lowest-risk components, before the composite values of US2/US3.

## PR summary (T060 — SC-002 final audit, recorded 2026-10-07)

**SC-002: both FR-003 lint layers pass with zero exceptions.**
- Layer 1 (depcruise): the full run over `packages/studio/src` reports
  **zero violations** (1075 modules) — including the
  `gallery-modules-no-store-writes` rule and `no-circular`, whose two
  D-090-7 violations on the character-inventory spine were closed in
  this polish pass (D-090-45).
- Layer 2 (call-site audit, `galleryWriteAudit.test.ts`): **4/4 green**
  over the registered US1–US3 entries; the root eslint overlay carries
  the same lists and the package eslint run reports **0 errors**.
- The two **ruled scope determinations** recorded at the FR-003 sites
  are determinations, not exceptions: the spec-079 evidence layer is
  not a gallery write-around (D-090-29), and US3's Phase D action bans
  were ruled non-registered against the ratified
  record-from-working-copy design (D-090-31 → D-090-34). US4's three
  identifiers (`recordAssignments`, `setTouchDraft`, `deleteTouchKey`)
  are the same species: ruled non-registration by the lead
  (D-090-47, on D-090-38 Flag 1) and recorded at both FR-003 sites
  in the same form.

**Closing grep pack:**
- `phaseBDraftStore`: zero code references in `packages/studio/src`
  (one comment in the audit test documents the retirement) — SC-004.
- Gallery answer ids in `surveyAnswerStore`: only the ruled 079
  evidence-layer answers (marks/characters/punctuation within-step
  draft state); every gallery decision is recorded as a decision
  record, and T063 deleted the working copy's answer state.
- In-place IR rewrites outside an `apply`: the reducer's
  completion-time rewrites are all deleted (MARKS/R1/R2/deadkeys/
  rules cases gone); remaining `setWorkingIR` call sites in gallery
  trees (TouchGallery ×4, DeadkeySurface ×1) are edit-time writes
  under the ratified record-from-working-copy design (followups.md
  ledger note).

**Story gates:** golden walk byte-identical at each story's
adjudicated fixtures (US3: D-090-36; US4: D-090-39/-40); StepHost
parity green at every gate; `tsc` 0; full-suite classification at
D-090-42 (only the known SC-004 corpus pair reproduces). SC-003
(US5) is blocked on the D-090-43 ruling — see followups.md.
