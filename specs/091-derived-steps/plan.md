# Implementation Plan: Steps derived from decisions (specs/091-derived-steps)

**Branch**: `km/derived-steps` (stacked off `km/gallery-decision-modules`) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/091-derived-steps/spec.md`; series plan in
[088 HANDOFF.md](../088-modular-decisions/HANDOFF.md) phase 4; research in [research.md](research.md);
entities in [data-model.md](data-model.md).

## Summary

Spec 087 derived the **order** of steps from step-level `provides`/`requires` declarations in
`steps/stepDependencies.ts`, but which questions a step shows still comes from hand-written
`flowRefs`, and the decisions a gallery step settles are still `settles` name strings. After 090
every one of those names is a real decision module. This plan derives the **steps themselves**
from those modules: order all decision modules with the existing one sort
(`orderByDependencies`), partition the ordered list into screens (a custom-UI decision gets a
screen of its own; consecutive question-renderer decisions merge into one screen keyed by a new
optional `group` hint), move `gatedBy` onto the modules and derive each screen's gate from its
members, and delete `stepDependencies.ts`. Step ids become derived display ids; a frozen
legacy-id map keeps spec 081 deep links and restored-draft history resolving (SC-005). The parity
tests are **rewritten** per FR-005: a frozen baseline captured from `main` at 18e63aa4 remains as
regression data, but the authority moves to the declarations — the derived order must equal the
baseline *unless a `requires` edge explains the difference*. No visible change: the live walk
visits the same screens in the same order (SC-002) and the golden walk stays byte-identical
(SC-003).

## Decisions carried in (verbatim)

Owner's goal for the series, from [088 HANDOFF.md](../088-modular-decisions/HANDOFF.md):

> I have been trying for months to make decisions modular underneath, even if they have custom UI.

On placement ties, HANDOFF "Steps are derived":

> Ties keep the current order; the owner wants the default order kept.

On branching for this series (Matthew, 2026-10-06):

> Stack them: each spec branch off the previous spec's branch, implement in order without waiting for merges

Series governing rule (088 spec):

> decisions are the only stored state, and the keyboard is derived from them. Every fact is stored once.

Measurement rule for this series (088 spec, lesson from 087): every success criterion is measured
in the live app, as a Playwright walk in `pnpm dev` or a store-level test that drives the real
`StepHost`. Results from `DecisionsDemo` or `sc004Harness` don't count.

## Technical Context

**Language/Version**: TypeScript (repo stack), Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: existing only — `decisions/orderDecisions.ts` (`orderByDependencies`,
`effectiveGatedBy`, `deriveStepStructure` logic in `steps/stepOrder.ts`), the post-090 decision
module registry (`survey/questions/registry.ts` + 090's gallery/picker modules), zustand stores
(`decisionStore` from 088). No new dependency.

**Storage**: none. Screens are a pure derivation over the module list, recomputed, never
persisted. Answers are already keyed by decision id (088), so no draft data moves (FR-004).

**Testing**: vitest per package (never bare vitest at root); Playwright live walk in `pnpm dev`
for SC-002; the golden-walk script added by 089 for SC-003.

**Target Platform**: the studio SPA (`packages/studio`) only.

**Project Type**: web app — one package of the existing monorepo.

**Performance Goals**: derivation is O(modules) after the existing sort; it runs where
STEP_ORDER is computed today (module load / manifest build), not per render. No new timer (D3).

**Constraints**: no `packages/contracts` change; no new timer; i18n message ids MUST NOT change
(FR-006) — moving a question changes where it appears, not its id; no visible change to the
wizard (SC-002/SC-003); `stepDependencies.ts` MUST NOT exist at the end (SC-004).

**Scale/Scope**: 18 current steps; ~5 live question flows plus 090's gallery/picker modules;
consumers of the deleted file enumerated in research.md.

## Constitution Check

*GATE: evaluated before Phase 0 research and re-checked after Phase 1 design — PASS both times,
no violations, no Complexity Tracking entries.*

| Article | Assessment |
|---|---|
| I — Pattern schema locked | PASS — no Pattern field, type or schema is touched; nothing in `packages/contracts` changes (spec constraint). |
| II — KeyboardIR is the engine spine | PASS — no IR, codec or scaffold change; the derivation reads module declarations only. |
| III — Single working copy | PASS — no second copy, no intermediate serialization; screens are view structure over decisions. |
| IV — Validator layering fixed | PASS — no new debounce timer, no parallel validation path; derivation is synchronous data computation outside the D3 cycle. |
| V — VirtualFS only during authoring | PASS — no host-disk writes. |
| VI — Team boundaries | PASS — Engine owns the registry, the derivation and the step host wiring. Content-owned surface is untouched: question copy and i18n ids do not change (FR-006); the `group` hint is a structural label declared beside the module, not survey text. |
| VII — Out of scope | PASS — none of the excluded items is implemented; CJK/Ethiopic "not yet supported" routing is unaffected (it is a terminal, not a derived screen). |
| VIII — House conventions | PASS — commit titles in the locked `<prefix>(<area>)` vocabulary; no issue numbers in shipped code/comments; no emoji in console output. |
| IX — No survey surface outside the decision registry | PASS, and it is the point of the feature — Article IX already names `steps/stepDependencies.ts` as a declaration source beside the registry and states the registry is the single source of order for questions AND steps. This plan completes that: step membership and step-level `gatedBy` leave `stepDependencies.ts`, the file is deleted, and the manifest remains what Article IX says it is — an unordered set of step (screen-host) declarations that never states what comes before what. The article's text naming `stepDependencies.ts` should be updated in the same PR that deletes the file (a constitution correction following the change, per Governance). |

## Project Structure

### Documentation (this feature)

```text
specs/091-derived-steps/
├── spec.md          # feature specification (exists)
├── plan.md          # this file
├── research.md      # Phase 0 findings and decisions
├── data-model.md    # Phase 1 entities + the deriveScreens contract
├── quickstart.md    # Phase 1 validation guide
└── tasks.md         # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory: the feature exposes no external interface; the one contract
(`deriveScreens`) is internal and stated in data-model.md.

### Source Code (repository root)

```text
packages/studio/src/
├── survey/
│   ├── types.ts                    # QuestionModule gains optional `group`
│   └── questions/registry.ts       # one declaration-ordered module list for the derivation;
│                                   #   group seeded per module (identity/track/project_name/…)
├── decisions/
│   ├── deriveScreens.ts            # NEW: order (existing sort) + partition into DerivedScreens
│   ├── deriveScreens.test.ts       # NEW: partition rule, split runs, derived gates, US1 one-edit
│   ├── legacyStepIds.ts            # NEW: frozen 18-id inventory from main@18e63aa4 → screen id
│   └── stageGroups.ts              # stages follow screens (display metadata only)
├── steps/
│   ├── stepDependencies.ts         # DELETED (SC-004)
│   ├── stepOrder.ts                # STEP_ORDER / STEP_TRAILS derived from screens
│   ├── manifest.ts                 # pool keyed by screen id; no stepDependencies spreads;
│   │                               #   M-rule validation over the derived order
│   ├── registerEditorSteps.ts      # spreads removed; screen-host declarations only
│   ├── rulesStep.ts                # spread removed
│   ├── types.ts                    # Step loses provides/requires/gatedBy/flowRefs
│   ├── stepOrder.parity.test.ts    # REWRITTEN per FR-005 (baseline + edge-explanation)
│   └── manifest.test.ts            # M2 becomes manifest ≡ derived screens; M3–M6 over screens
├── dashboard/
│   ├── renderedNodeSet.ts          # Flow Map drill-downs from screen membership, not flowRefs
│   └── buildStepGraph.ts           # nodes/edges from derived screens + trails
├── lib/
│   ├── resolveLocation.ts          # legacy step ids resolve via LegacyStepIdMap
│   └── location.ts                 # unchanged grammar; resolution target is a screen id
└── stores/
    └── surveySessionStore.ts       # restored history sanitised through LegacyStepIdMap
```

**Structure Decision:** the derivation lives in `decisions/` beside the sort it consumes
(`deriveScreens.ts` next to `orderDecisions.ts`), as plain data with no component imports — the
same cycle-avoidance discipline `stepDependencies.ts` documents today (stores must reach the
screen list without importing the manifest). The manifest keeps its role as the unordered pool
of screen-host declarations (components, inputs, writes, persistence, specRef, lock) and is
arranged by the derived screen order.

## Design highlights

- **Placement (FR-001)** is the sort's output position: a decision sits in the earliest slot
  after the providers of everything it `requires`; ties keep the current order via the stable
  tie-break on declaration order. No new placement code — the partition consumes the order.
- **Screen formation (FR-002)** and the two-level treatment of intra-step flows
  (`phase_b_characters` inside `characters`, `phase_f_helpdocs` inside `help`) are decided in
  research.md; `group` is seeded from today's flows so the derived screens reproduce today's
  wizard exactly before any `requires` edit moves anything.
- **Gates (FR-003)**: a screen is walked iff at least one of its decisions is not gated off;
  trails re-derive over screens, preserving `project_name → characters` and
  `touch_seed_source → touch`.
- **Parity (FR-005)** is a rewrite, not a regeneration: baseline literals from `main`@18e63aa4
  stay as data; the assertions become baseline-equality *modulo* requires-edge explanations,
  plus the kept adversarial-input property over screens (research.md).
- **`package` screen treatment — RULED/confirmed** (research.md; owner ruling 2026-10-06,
  km-lead proposals Q9): the `package` screen has no decision module; it is a terminal screen
  appended after the last derived screen. This is settled, not an open question — no
  confirmation at implementation kickoff is needed.

## T001 audit — stacked-branch state (2026-10-07, on the 090 @ 726ebcfd restack)

Verified against the landed tree (merge 54fe4883), not the plan's assumptions:

- **088 ✓** `stores/decisionStore.ts` is live; completions record decisions
  through it; the golden-walk script (089) is present at
  `packages/studio/e2e/golden-walk.spec.ts` (its capture is a CI gate per the
  owner's ruling, not a local blocker).
- **089 ✓** `applyDecisionEffects` in `steps/reducer.ts` is the question
  write path; the mutate seam / flag are gone.
- **090 — coverage complete, depth partial.** All fourteen `settles` names in
  `stepDependencies.ts` have exactly one registered gallery module with
  `provides` / `requires` / `renderer` (`registry.ts` galleryModuleList), and
  every gallery `requires` mirrors its step declaration. Eight carry real
  renderers/applies (US1+US2: windows-layout, base-keyboard,
  touch-seed-source, character-inventory, marks-treatment,
  punctuation-inventory, invisibles-inventory, retained-convenience-chars).
  Six are declaration-complete **stubs** — `UnmigratedGalleryRenderer`, no-op
  `apply` — pending 090 US3–US5: carved-layout, deadkeys-defined, rule-set,
  physical-layout, touch-layout, help-docs. The derivation reads only
  provides/requires/renderer-kind, so the core is unblocked; hosting
  equivalence for the six is 090's remaining work and shows up as a
  parity-report delta until 090 completes.
- **Delta A (plan assumption vs. landed 090): no screen key exists.**
  data-model.md names a singleton's id "the module's declared screen key
  (seeded with today's step names — when 090's modules are declared)". No
  such field exists on `QuestionModule` / `GalleryModule` or in any gallery
  module. 091 must seed it, exactly as T002/T003 seed `group`; proposed as
  an optional `screen?: string` on the module contract, seeded on the
  fourteen gallery modules with today's step ids. Flagged to the lead with
  the Phase 2 report — T005's singleton ids depend on it.
- **Delta B: no `gatedBy` field on modules.** Question gates are
  routing-derived (`effectiveGatedBy`) and need no field. Of the two
  step-level gates, project_name's is a property of its flow's routing
  (derived ✓), but touch_seed_source's "asked only while unrecorded" gate
  exists **only** in `stepDependencies.ts` — its module's header says so
  explicitly. FR-003's move therefore needs an optional `gatedBy` on the
  module contract, seeded on the touch-seed-source module; folded into
  Phase 2 (T005) and flagged with Delta A.
- **Inherited, do not fix here:** the depcruise cycle
  `survey/types ↔ workingCopyStore` is present in this base (090 merged 089
  @ 03d1a1ef; the fix 030bf59c sits on `km/decision-apply` and arrives via a
  later 090 merge). `pnpm lint` reports it until then; it is not 091
  fallout.
- **Init-cycle constraint on T008 (from 090's D-090-7):** `stepOrder.ts`
  executes its sort at module load and is reached during registry load
  (registry → gallery renderer → workingCopyStore → completeness →
  stepOrder). A module list exported from `registry.ts` (T004) is therefore
  safe for component-layer consumers (manifest seam, StepHost, tests) but
  may be mid-initialisation when `stepOrder`'s top level runs. T008 will
  verify empirically and stop-and-report rather than adapt if it bites.

## Phase 2 deltas (2026-10-07, for lead ratification)

- **Delta P1 — the track step's ordering edge lived only in
  `stepDependencies.ts`.** `track_choice` declared no `requires`; the
  `track` step's `requires: ["base-keyboard"]` had no module-level source,
  so the derived order sorted track (and project_name) before
  layout/choose_base. Re-homed per FR-003: `track_choice` now declares
  `requires: ["base-keyboard"]`. **REVISED in Phase 4 — the edge is now a
  `screenRequires` declaration, not a module `requires`; see the Phase 4
  revisions below.**
- **Delta P2 — research.md's project_name gate claim is falsified.**
  research.md held that project_name's copy-track gate "is already a
  property of its questions' routing". It is not: `track_choice`'s
  `next: null`, the copy/adapt fork is manifest-level
  (`StudioShell.handleTrackSelected`), and neither project_name module
  declared a gate. Re-homed per FR-003: `project_display_name` declares
  `requires: ["authoring-track"]` and
  `gatedBy: (d) => d["authoring-track"]?.value === "copy"`;
  `project_keyboard_id` declares the same `gatedBy`. With P1+P2 the
  derived screens reproduce the frozen baseline exactly — all 17 screens
  in step order, project_name a gated side trail joining `characters`,
  touch_seed_source a gated side trail joining `touch` (pinned in
  `decisions/deriveScreens.test.ts`). **REVISED in Phase 4 — the ordering
  edge is now `screenRequires` and the gate is a composition-layer
  declaration (Delta P6); see below.**
- **Delta P3 — the per-flow loader assumed flow-local `requires`.**
  `loadDerivedFlowDef` sorts one flow's modules alone, and
  `orderByDependencies` fail-fast throws on a requirement with no provider
  in the set — so P1/P2's cross-flow edges broke every
  `loadFlowSourceDef` call for the track and project_name flows (8 tests
  in `dashboard/buildStepGraph.test.ts`). The cross-flow edge carries no
  information for a flow's internal order (the provider is not a member),
  so `survey/loadDerivedFlow.ts` now scopes each module's `requires` to
  the decisions its own flow provides before sorting, and maps the sorted
  copies back to the original modules. Unresolved-requirement diagnosis
  still fires in the full-list derivation and the registry provider
  index. This file is 087 machinery, not a named 091 task — flagged for
  ratification; reversible in one commit if the lead prefers the
  external-providers treatment inside the sort itself.
- **T008 outcome — SUPERSEDED by Delta P4 below.** The Phase 2 report
  claimed the D-090-7 init-cycle did not bite, on the evidence of the
  131-file gate batch. That evidence was misleading (see P4); the claim
  is withdrawn.

- **Delta P4 — T008 reverted: the D-090-7 init-cycle DOES bite, and the
  Phase 2 batch masked it.** In Phase 3, `deriveScreens.test.ts` failed
  STANDALONE at module load: `TypeError: items is not iterable` at
  `orderDecisions.ts` ← `deriveScreens` ← `steps/stepOrder.ts:41` ←
  `dashboard/completeness.ts:27` — stepOrder's top level read the
  registry's `decisionModules` while the registry was still evaluating
  (registry → gallery renderer → stores → completeness → stepOrder), so
  the binding was undefined. Bisect-verified: the failure reproduces at
  the Phase 2 commit with all Phase 3 changes reverted, standalone; the
  131-file batch passed because shared workers had already completed
  registry evaluation via earlier files. Per the audit's own contingency,
  T008 is reverted: `stepOrder.ts` again derives from
  `stepDependencies.ts` (which reads only the cycle-safe `flowModules`
  leaf, per D-090-7), with the `deriveStepStructure` relocation kept.
  **Phase 4 prerequisite:** when T012–T016 delete `stepDependencies.ts`
  and re-point the store/dashboard consumers, the screen-derived
  STEP_ORDER must land together with breaking the
  completeness/workingCopyStore → stepOrder-during-registry-evaluation
  path (or an equivalent leaf-level module list); T008's one-file change
  cannot land safely on its own.
- **T016 flip inventory (Phase 4, for the held deletion).** With
  T012–T015 landed, the remaining LIVE references to
  `stepDependencies.ts` machinery are exactly: (1) `steps/stepOrder.ts`'s
  derivation source (plus Delta P4's cycle prerequisite);
  (2) `lib/draftPersistence.ts`'s `stepHasSettles` import (re-home at the
  flip: a screen whose members include a gallery module settles
  non-question decisions); (3) `decisions/galleryModules.coverage.test.ts`
  (090's coverage oracle — its stepDependencies baseline must be carried
  as literals or re-derived from screens at the flip);
  (4) `decisions/successCriteria.sc002.test.ts` fixtures;
  (5) `steps/stepOrder.parity.test.ts` (the frozen oracle + the T017
  report-only block's membership baseline). Everything else is comments.
  The flip is one commit when the lead releases the hold.
- **Finishing-phase flip — LANDED (2026-10-07, after spec 090 completed
  at fee8fb82 / PR #1981; the hold above is discharged).** One commit, as
  prescribed: stepDependencies.ts deleted; T008 landed in the
  re-publication shape (steps/manifest.ts holds the one live
  deriveScreens call; steps/stepOrder.ts re-publishes derivedScreens /
  screenTrails as STEP_ORDER / STEP_TRAILS — the registry is never read
  from stepOrder, so Delta P4's cycle cannot re-form, and the
  deriveScreens standalone canary passes); settles re-homed to
  decisions/screenSettles.ts (pure `settlesByScreen` in
  decisions/deriveScreens.ts; lazy memoised live binding — no
  module-init registry read), consumed by 090's recorder
  (createStudioDecisionRecorder) and the 088 draft migration
  (draftPersistence); the coverage oracle re-derived from screens with
  the table's step requires carried as frozen baseline literals; SC-002's
  step-layer fixtures contracted from the derived screens; the parity
  oracle retired into FR-005 baseline form (T017 — the module graph
  reproduced the frozen 14 tie-break pairs exactly, and no baseline
  inversion needed an edge explanation). One consumer surface the Phase
  4 inventory did not name: 090 US5's `settlesForStep` import in the
  recorder (landed after the inventory) — re-homed with the rest. Three
  test files' partial manifest mocks (galleryLogEntries, StepHost.test,
  deepLinkRevision) were extended to model the manifest module's derived
  exports, since stepOrder now reads them at init through advance.ts.
  Constitution Article IX corrected in the same commit (T024; footer
  1.2.0 → 1.3.0 — spec 093's T025 independently set 1.3.0 for its Article
  III amendment on its branch; the collision resolves at 093's restack).
- **Delta P5 — the one sort conflates routing edges with requires edges;
  SC-001's edit closes a false cycle.** T009's prescribed edit
  (`il_language_autonym` += `requires: ["base-keyboard"]`) cycles in
  `orderByDependencies`: autonym →(requires) baseKeyboard →(requires)
  il_language_code, and il_language_code is autonym's routing successor
  (`next: "il_language_code"`), so the routing-predecessor edge closes
  the loop. A moved question's `next` is stale by construction — the
  move is the point of the edit — and FR-001 makes `requires` the
  placement authority. Fix in `decisions/orderDecisions.ts`
  (`routingPredecessors`): a routing edge u → v is dropped for ordering
  when u already transitively requires a decision v provides. Inert on
  conflict-free inputs (a live conflict is a cycle today, so no current
  declaration set contains one); `orderParity.test.ts` stays green
  unmodified. This is 087 sort semantics, not a named 091 task — flagged
  for ratification alongside P3. **REVERTED in Phase 4 — the drop breaks
  SC-002's fail-fast contract; see below.**

## Phase 4 delta revisions (2026-10-07, for lead ratification)

- **Deltas P1/P2 revised — cross-flow `requires` on question modules is
  falsified by the frozen per-flow contracts.** Phase 4's full-suite runs
  surfaced what the Phase 2/3 batches masked: `orderParity.test.ts`
  (protected, unmodifiable) and `successCriteria.sc002.test.ts` both sort
  each flow's modules ALONE via `orderDecisions(flowModules.<flow>)`,
  where P1/P2's cross-flow `requires` are unresolvable and throw. The
  re-homing's final shape keeps the facts as declarations but on channels
  the per-flow sorts never see:
  - ordering edges → **`screenRequires`** (new optional field on
    QuestionModule, `survey/types.ts`): `track_choice` declares
    `["base-keyboard"]`, `project_display_name` declares
    `["authoring-track"]`. `deriveScreens` folds `screenRequires` into
    its full-list sort only; the sort's unresolved diagnosis still fires
    there if a provider is genuinely absent.
  - gates → **Delta P6** below.
  Ablation evidence: with neither channel, the derived order is
  identity, track, project_name, layout, choose_base, … (the edges are
  load-bearing); with `screenRequires`, the frozen baseline reproduces
  exactly and orderParity/SC-002 pass unmodified.
- **Delta P5 reverted — the routing-edge drop silences SC-002's fault
  injection.** `successCriteria.sc002.test.ts` requires every injected
  undocumented routing edge to surface as a named error; under the drop,
  three identity_lite injections (e.g. `il_language_region ->
  il_language_english`) produced NO ERROR, and the sweep counts failed.
  (Phase 3's first run showed exactly this failure; it was misattributed
  to worker pollution at the time — corrected here.) The
  `routingPredecessors` change is reverted verbatim; 087 sort semantics
  are restored. Consequence for SC-001: the one-edit move
  (`il_language_autonym` += `requires: ["base-keyboard"]`) trips the
  sort's named cycle error while the moved question's `next` still
  points at its old successor; the T009/T011 tests now make the edit
  with the `next` re-point included, plus a pin test asserting the
  requires-only form fails fast with a named cycle error. OPEN for the
  lead: grow a requires-wins rule in 087's sort properly (with SC-002
  amended by its owner), or SC-001's contract is "edit the declaration,
  including its routing".
- **Delta P6 — screen gates for non-routing-expressible screens are
  declared at the composition layer.** Phase 2's module-level `gatedBy`
  re-homing (touchSeedSource, both project_name modules) violates spec
  087's FR-005 invariant — `orderDecisions.test.ts`: "no registry module
  declares gatedBy (conditional visibility comes from next only)". The
  two gates are not routing-expressible (project_name's fork is
  manifest-level; touch_seed_source is a custom screen asked while
  unrecorded), so they are declared in the registry's
  **`declaredScreenGates`** map (keyed by screen id, predicates identical
  to the stepDependencies oracle) and passed to `deriveScreens` by
  `steps/manifest.ts` and the gate-sensitive tests. The `gatedBy` field
  added to QuestionModule in Phase 2 is removed; member gates in
  `deriveScreens` are routing-derived only. Alternatives the lead may
  prefer: (a) amend 087's FR-005 invariant with a 091 carve-out and
  restore module-level gates; (b) express the project_name fork as
  cross-flow routing on `track_choice` (changes what the live runner
  reads — 092's territory, not attempted).

## Phase 6 record (2026-10-07) — T023/T025/T026 outcomes

- **T023** landed: `lib/legacyStepIds.test.ts` — all 18 inventoried ids
  resolve through the map + `resolveLocation` to the screen holding the
  step's decisions (oracle provides ⊆ derived screen decisionIds);
  `done`/`unsupported` pass through.
- **T025** landed: `docs/architecture.md` (manifest shape without
  `flowRefs`; order derivation now names `deriveScreens`) and
  `docs/carve-gallery-flow.md` §1 updated; no other live docs referenced
  the retired machinery (specs/archive excluded per the task).
- **T026 full gates**: studio suite 494 files / 8724 tests — 8708 passed,
  1 skipped, 15 failed, classified by bisection against the Step-0 merge
  commit `54fe4883` (temp worktree, symlinked node_modules):
  - **091 fallout, fixed**: `StudioShell.test.tsx` M4/M4b ×2 (asserted
    `step.gatedBy`, deleted by T014; now read the derived `screenGates`).
    File green standalone (66/66) after the fix.
  - **Inherited from the stacked 090 in-flight base** (all fail
    identically at `54fe4883`): registry inventory 114→128 and membership
    groups (the 14 gallery modules are 090's migration state),
    marksTreatment definition-contract snapshot (writes [] → [groups,
    stores] from 090's US2), windowsLayout renderer provenance test,
    goldenWalk ×2 (an extra `record` mutation at the layout step —
    090's gallery recording vs the committed fixture), renderSmoke ×2
    (touch_seed_source stub host), orphan-input-lint ×1. These belong to
    090's completion and its restack, not to 091; NOT fixed here.
  - **Pre-existing local-corpus SC-004** ×4 (arabic_izza, basic_kbdru),
    documented since 088.
  - `tsc --noEmit` clean. `pnpm lint`: eslint stage 0 errors (398
    warnings, repo-wide norm); depcruise reports 130 `no-circular`
    errors, every chain running through the inherited
    `survey/types → workingCopyStore → stepOrder → stepDependencies →
    flowModules` cycle named in the kickoff brief (fix `030bf59c` lands
    via 090's merge of km/decision-apply) — no chain passes through any
    091 derivation module; the derivation stays cycle-free. Downstream
    custom lints were not reached past depcruise, except
    `i18n-catalog-lint`, run standalone: PASS (catalogs in sync, ids in
    order — independent FR-006 confirmation; the branch diff also shows
    zero message-id changes: the only descriptor change is the
    SCREEN_TITLE_MESSAGES map KEY `phase_f_helpdocs` → `help`, id
    `step.phaseF.title` byte-identical).
- **Held, unchanged**: T016 (deletion + flip inventory above), T017
  landing gate (report-only block green in the full run), T019 (live
  verification), T024 (constitution, lands with T016). T027's
  spec↔plan↔tasks self-analyze is consistent (every FR has landing
  tasks; open items are exactly the four holds); the km-lead review
  cycle and the PR are the lead's step.
