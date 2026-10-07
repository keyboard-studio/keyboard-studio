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
