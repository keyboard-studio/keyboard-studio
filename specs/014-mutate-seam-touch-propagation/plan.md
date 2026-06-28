# Implementation Plan: KeyboardIR `mutate` seam + touch propagation

**Branch**: `km/mutate-seam-touch-propagation` | **Date**: 2026-06-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-mutate-seam-touch-propagation/spec.md`

> ## ✅ IMPLEMENTED (2026-06-28) — Phase 5 shipped via PR #823 (US1) + #825 (US2–US5), merged to main.
>
> ## ✅ PRECONDITION CLEARED — RE-VALIDATED AGAINST THE RATIFIED CONTRACT (2026-06-28)
>
> This plan was originally PROVISIONAL AND GATED on the engine mutation contract **#5b / #232**. **That gate is now CLEARED:** the contract ratified and merged to main in **PR #822** (`@keyboard-studio/contracts` 0.12.0; §18 sign-off recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md)).
>
> The plan is planned against the now-**ratified** `mutate` contract shape:
> a **pure** `mutate(value, ctx: MutateContext): Partial<KeyboardIR>` that the reducer applies, runtime-asserting the patch touches only the module's declared `writes` paths, **idempotent** on re-apply, applied as a **path-scoped deep merge** at the declared `IRPath` locations. This matches the activated `mutate?` signature + `MutateContext` in `packages/studio/src/survey/types.ts` and the `TouchKeyIR.provenance?` field in `packages/contracts/src/keyboard-ir.ts` exactly.
>
> **T000 re-validation outcome (2026-06-28):** every `writes` `IRPath` in the 5 in-scope identity/header modules resolves cleanly to the ratified `KeyboardIR`/`IRHeader` shape (`header.bcp47`, `header.name`, `header.copyright`, `stores[*]`) — **no `writes`/IR-shape drift** (the §8 risk is mitigated; spec Edge Cases, FR-003). The two former flagged-pending Constitution gates — **Article I/§18 contracts bump** and **Article II IR-shape finalization** — are now **RESOLVED** by #822 (see the updated Constitution Check below). This plan is **ready-to-implement**; T003–T018 are ungated.

## Summary

Phase 5 (P5) of the Survey Modularity + CYOA Refactor ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §6 P5) closes the **state fork** that P4 left open: today answer-bearing questions flow to `workingCopyStore` as survey results while the carve/add galleries mutate the `KeyboardIR` *directly*. P5 unifies both into **one executed write surface** — the question module's `mutate()` — and adds a safe, provenance-aware touch re-propagation contract on top of it.

Technical approach (against the anticipated #5b/#232 contract):

- **Activate `mutate()` as a pure patch producer.** Turn the P2 declared-but-stubbed `mutate?` (`packages/studio/src/survey/types.ts`) into an executed `mutate(value, ctx): Partial<KeyboardIR>`. The §3.4 manifest reducer (`steps/reducer.ts` `applyStepCompletion`) applies the returned patch as a **path-scoped deep merge at the module's declared `writes` `IRPath`s only** (Q9), runtime-asserts declared-`writes` containment with **fail-fast whole-patch rejection in all builds** (Q11, FR-003), and is **idempotent** (FR-004).
- **Convert the in-scope write surfaces (Q4=B).** Route the **carve/add shell** (carve remove-mode + the add galleries in `editors/` — the prong that carries the strategy-bearing carve/mechanism/touch IR writes) and **all 5 question modules with non-empty `writes` (the identity/header writers)** through `mutate()`, retiring the direct `workingCopyStore` carve mutators (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll`) and the add-gallery's direct selected-pattern IR writes. **Display-only (empty `writes`) stays no-op; answer-store-only / identity-metadata modules are out of scope** (FR-007).
- **Promote per-key provenance onto the contract (Q2=A).** Add a provenance field to `TouchKeyIR` in `packages/contracts` (`base-derived` / `physical-suggested` / `hand-set`), defaulting to `hand-set`; make the editor-layer `TouchKeyProvenance` (`editors/assignLoop/provenance.ts`) a **re-export** of the contracts type; ensure it **survives serialize/round-trip**. This is the **`packages/contracts` MAJOR bump** with a §18 joint engine+content session (FR-008/-010/-011).
- **Wire automatic touch re-propagation (Q5=A + follow-up).** On physical-lock break / physical-step completion, re-run `touchSuggest` driven by the **P4b `staleSteps` slice** (root-set + completeness fixpoint) over **only** `base-derived` / `physical-suggested` keys, **never `hand-set`** (no-clobber, FR-012); a manual edit to a `physical-suggested` key **promotes it to `hand-set`** (FR-014); multiple stale steps coalesce into a **single re-propagation pass over the union of the staleness closure** (Q10, FR-013).
- **Add the single global rollback flag (Q6=A).** One build/deploy-time global gates `mutate()`. Off ⇒ the P4b declared-only seam, output **byte-identical to P4b** (FR-015/-016).
- **Wire the real per-spine-prefix validator (Q8 — resolves 012's deferral).** Replace 012's structural proxy (`dashboard/completeness.ts` C4) with the **real per-spine-prefix validator** run against the working copy `mutate()` produces at each prefix, kept **distinct** from inputs-satisfiability and respecting the **Article IV single-debounce / single-validation-path** rule (FR-017/-018).

## Technical Context

**Language/Version**: TypeScript 5.x (strict; Bundler module resolution with **explicit `.ts`/`.tsx` import extensions**), React 18, Vite. Node ≥ 20, pnpm 9.

**Primary Dependencies**: `@keyboard-studio/contracts` (`IRPath`, `irPath()`, `formatIRPath()`, `KeyboardIR`, `TouchKeyIR`, `QuestionModule`) — **this feature bumps contracts MAJOR** to add the `TouchKeyIR` provenance field; the P4b `steps/` step model + `applyStepCompletion` reducer; the `workingCopyStore` staleness slice (`staleSteps`); the `editors/touchSuggest/` generator; the `dashboard/completeness.ts` checks; `engine/src/validator` (Layer A) for the real per-spine-prefix validator; vitest + Playwright; dependency-cruiser.

**Storage**: N/A — in-memory VirtualFS + zustand working copy (Constitution Art. V). Provenance becomes part of the persisted `KeyboardIR` (serialize/round-trip), not a new store.

**Testing**: vitest (`pnpm --filter @keyboard-studio/studio test`), per-question mirrored test tree `packages/studio/tests/survey/questions/<phase>/<id>.test.ts` (Q7), reused existing IR fixtures + new provenance-tagged touch-layout fixtures, `pnpm depcruise` for boundary rules, contracts round-trip tests in `packages/contracts`.

**Target Platform**: Browser SPA (studio), authored desktop-first; output is `.kmn` / touch-layout JSON via VirtualFS.

**Project Type**: Cross-boundary change — `packages/contracts` (Engine-owned locked surface; provenance field + MAJOR bump) **and** the `@keyboard-studio/studio` survey/editor front end. Requires a §18 joint engine+content session (see Constitution Check VI + Assumptions).

**Performance Goals**: No new survey hot-path cost beyond a bounded patch merge per step completion. Re-propagation runs at most once per physical change over the bounded staleness closure (coalesced, Q10). The single 300 ms debounce cycle (D3) is untouched (Art. IV).

**Constraints**:
- **Gate CLEARED (#822, 2026-06-28)** — the engine mutation contract ratified (`@keyboard-studio/contracts` 0.12.0); the plan was re-validated against the ratified shape on 2026-06-28 (FR-001, T000), no `writes`/IR-shape drift.
- Strict-TS explicit-extension imports — the provenance re-export and any moved code update specifiers including the extension.
- Flag **off** ⇒ byte-identical to P4b; **zero** `mutate()` executes (FR-016, SC-008).
- Fail-fast whole-patch rejection on undeclared-`writes`, in **all** builds (Q11) — not a dev-only assert.
- Path-scoped deep merge — never a shallow top-level branch replace (Q9).
- Article IV — no second debounce timer / parallel validation path when wiring the real validator (FR-018).
- Article VII — touch is seeded from the locked physical layout; re-propagation is a propagation/merge over the physical-derived substrate, never touch-first authoring.

**Scale/Scope**: 1 contract field added (`TouchKeyIR` provenance) → contracts MAJOR bump. `mutate?` stub → executed pure function. 5 non-empty-`writes` identity/header question modules + the carve/add shell (which carries the strategy-bearing writes) converted (≈6 write-surface conversions). 6 retired direct `workingCopyStore` carve mutators + add-gallery direct writes. 1 reducer patch-apply path (path-scoped deep merge + containment assertion). 1 re-propagation driver off `staleSteps`. 1 global flag. 1 real per-spine-prefix validator replacing C4's proxy. New provenance-tagged fixtures + reuse of existing IR fixtures.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature was design-only / BLOCKED; the gate is now **CLEARED** by #822 (2026-06-28). The gate is evaluated against the **ratified** #5b/#232 contract shape (`@keyboard-studio/contracts` 0.12.0). The three formerly flagged-pending articles are now **RESOLVED** — the contract ratified and the §18 sign-off was recorded by Matthew Lee (contract authority) in [docs/spec-signoff.md](../../docs/spec-signoff.md).

| Article | Gate | Verdict |
|---|---|---|
| **I. Pattern schema is a locked contract** | Does this rename/retype/remove a `Pattern` field or its zod mirror? Does it edit a locked `packages/contracts` surface? | **RESOLVED (gate item G-I, was FLAGGED-PENDING).** No `Pattern` field is renamed/retyped/removed (Assumptions confirm this). The provenance field on the locked `TouchKeyIR` contract + the `@keyboard-studio/contracts` bump **landed in #822** (0.11.0 → 0.12.0; per the §18 sign-off this is the package's pre-1.0 0ver mapping of a spec-level MAJOR contract change to a minor bump, same convention as the #232 lock's 0.3.0 and the IRPath 0.11.0 bumps). The §18 joint engine+content session was convened and **recorded** in [docs/spec-signoff.md](../../docs/spec-signoff.md) (2026-06-28, reviewed by Matthew Lee). The zod mirror (`packages/contracts/src/schemas.ts` `TouchKeyProvenanceSchema` + drift guard) was updated in the same change as the type (Art. I drift guard holds). |
| **II. KeyboardIR is the engine spine** | Does code operate on raw `.kmn` instead of IR, or drop opaque fragments? Is the IR write surface real? | **RESOLVED (gate item G-II, was FLAGGED-PENDING).** All writes go through the typed IR via `mutate()` → reducer patch-merge; nothing touches raw `.kmn`; opaque fragments are untouched. The executable mutation surface is now **ratified** by #822: `mutate?(value, ctx: MutateContext): Partial<KeyboardIR>` is the activated type-level signature in `survey/types.ts`. **Re-validated 2026-06-28 (T000):** all 5 in-scope modules' `writes` `IRPath`s resolve cleanly to the ratified `KeyboardIR`/`IRHeader` shape (`header.bcp47`, `header.name`, `header.copyright`, `stores[*]`) — no shape drift. The FR-003 fail-fast containment assertion is the runtime guard at apply time (T008/T014). |
| **III. Single persistent working copy** | Does it add a second working copy or intermediate serialization? | **PASS.** `mutate()` returns a *patch* the existing reducer applies to the one working copy; no second copy, no intermediate serialization. Provenance rides on that copy and is serialized only at output. Re-propagation mutates the same copy in place via the reducer. |
| **IV. Validator layering is fixed (one 300 ms debounce)** | Does it add a second debounce or a parallel validation path? | **PASS (with note).** The real per-spine-prefix validator (FR-017) runs **within** the existing single validation path / debounce cycle (D3); shippability stays **distinct from** inputs-satisfiability (FR-018) but introduces **no** second debounce timer and **no** parallel path. Tasks explicitly forbid a new timer. |
| **V. VirtualFS only during authoring** | Does it write to host disk during authoring? | **PASS.** No new I/O; all state stays in-memory; output serialization unchanged. |
| **VI. Team boundaries** | Which team owns this, and does it stay in bounds? | **RESOLVED (gate item G-VI, same root as G-I).** Spans the **Engine** boundary (the `KeyboardIR`/`TouchKeyIR` contract + validator wiring) **and** the studio survey/editor surface. The contracts bump that touches the locked Engine surface **landed in #822** with the §18 joint engine+content session **recorded** in [docs/spec-signoff.md](../../docs/spec-signoff.md) (FR-011, SC-010). Studio-side `mutate()` conversion and re-propagation stay within the front-end boundary. |
| **VII. Out of scope for v1** | Does it implement any §16 forbidden item? | **PASS.** No CJK/Ethiopic reorder, no LDML, no touch-first / reverse touch→physical authoring (FR-019; re-propagation seeds touch from the locked physical layout, never the reverse), no multi-source merge, no publishing paths, no flow-map editor, no library/reserve deletion. |
| **VIII. House conventions** | Console emoji? backticked file refs in user text? issue numbers in code? commit style? | **PASS.** No console emoji; provenance tags are typed string literals, not emoji; issue numbers (#5b/#232) are cross-linked in spec/plan/commit prose, **not** embedded in shipped code/comments (Art. VIII); commits follow `<prefix>(<area>): …`. |

**Constitution Check (re-validated 2026-06-28): PASS on all articles.** Articles III, IV, V, VII, VIII passed cleanly from the start; Articles I, II, VI (gate items G-I, G-II, G-VI) are now **RESOLVED** by #822 (contract ratified + §18 sign-off recorded) and the T000 `writes`-vs-ratified-IR re-validation (no drift). They are tracked as resolved in **Complexity / Gate Tracking** below. The plan is **ready-to-implement**; T003–T018 are ungated.

*Post-Design re-check (after Phase 1, re-validated 2026-06-28):* the design artifacts (data-model, contracts, quickstart) were written against the anticipated shape and have been re-validated against the **ratified** #822 contract — the anticipated and ratified shapes match (`mutate?(value, ctx): Partial<KeyboardIR>`, `TouchKeyIR.provenance?`); no new violation introduced and all three formerly-open gate items (G-I/G-II/G-VI) are now RESOLVED.

## Project Structure

### Documentation (this feature)

```text
specs/014-mutate-seam-touch-propagation/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (mutate-seam, provenance, repropagation, validator)
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

**(EDIT)** marks existing files changed; **(NEW)** marks net-new; **[LANDED in #822]** marks the contract edits that already landed when the gate cleared (2026-06-28).

```text
packages/contracts/src/
  keyboard-ir.ts                 # (EDIT) [LANDED #822] provenance field on TouchKeyIR (Q2/FR-008)
  schemas.ts                     # (EDIT) [LANDED #822] zod mirror of provenance (Art. I drift guard)
  index.ts                       # (EDIT) [LANDED #822] provenance type exported for editor re-export
  package.json                   # (EDIT) [LANDED #822] version bump 0.11.0 → 0.12.0 (FR-011)

packages/studio/src/
  survey/
    types.ts                     # (EDIT) activate mutate(value, ctx): Partial<KeyboardIR> (was stub)
  steps/
    reducer.ts                   # (EDIT) applyStepCompletion applies the mutate patch:
                                 #        path-scoped deep merge at declared writes (Q9) +
                                 #        fail-fast declared-writes containment assert (Q11) + idempotent
    mutateApply.ts               # (NEW) pure patch-merge + containment-assertion helper (reused by reducer)
    repropagate.ts               # (NEW) staleSteps-driven, coalesced single-pass touch re-propagation (Q10)
  flags/
    mutateFlag.ts                # (NEW) single global flag gating the mutate() write path (Q6)
  editors/
    assignLoop/
      provenance.ts              # (EDIT) [LANDED #822] now a RE-EXPORT of the contracts provenance type (FR-008)
      touchBehavior.ts           # (EDIT) manual edit to physical-suggested key promotes to hand-set (FR-014)
    carve/
      CarveGallery.tsx           # (EDIT) route edits through mutate() patch, retire direct store mutators
    touchSuggest/
      touchSuggest.ts            # (EDIT) tag produced keys with provenance on (re)propagation (FR-012)
  stores/
    workingCopyStore.ts          # (EDIT) retire deleteNode/restoreNode/deleteItem/restoreItem/restoreAll/keepAll
                                 #        as the in-scope IR write path (flag-on); staleSteps slice reused as-is
  survey/questions/<phase>/<id>.ts  # (EDIT) the 5 non-empty-`writes` identity/header modules: stub → executed mutate()
  dashboard/
    completeness.ts              # (EDIT) C4 proxy → real per-spine-prefix validator wiring (FR-017)

engine/src/validator/            # (consume) real per-spine-prefix validator entry the studio wires C4 to

packages/studio/tests/survey/questions/<phase>/<id>.test.ts  # (NEW/EDIT) per-question mutate output tests (Q7)
packages/studio/tests/fixtures/                              # (NEW) provenance-tagged touch-layout fixtures (Q7)
packages/contracts/                                          # (NEW) provenance round-trip test
.dependency-cruiser.cjs          # (EDIT) allow studio→contracts provenance edge; flags/ leaf rules
```

**Structure Decision**: A cross-boundary change. The contract edit (provenance on `TouchKeyIR` + version bump) is confined to `packages/contracts/src/{keyboard-ir,schemas,index}.ts` + `package.json` and **[LANDED in #822]**. The studio side adds `steps/mutateApply.ts`, `steps/repropagate.ts`, `flags/mutateFlag.ts`, edits `survey/types.ts`, `steps/reducer.ts`, the 5 non-empty-`writes` modules, the carve/add editors (which carry the strategy-bearing writes), `touchSuggest`, and `dashboard/completeness.ts`. Per-question tests stay in the mirrored `packages/studio/tests/survey/questions/<phase>/` tree (Q7); the provenance round-trip test lives in `packages/contracts`.

## Complexity / Gate Tracking

> Originally filled because the Constitution Check had flagged-pending gate items (consequence of the spec's BLOCKED status). **All three are now RESOLVED** by #822 (contract ratified + §18 sign-off recorded) and the T000 re-validation (2026-06-28).

| Gate item | Article | Status | Resolution |
|---|---|---|---|
| **G-I — `TouchKeyIR` provenance field + contracts bump** | I / §18 | **RESOLVED (#822, 2026-06-28)** | The provenance field + bump (0.11.0 → 0.12.0; pre-1.0 0ver mapping of a spec-MAJOR contract change to a minor bump) **landed in #822**; the §18 joint engine+content session is **recorded** in [docs/spec-signoff.md](../../docs/spec-signoff.md) (reviewed by Matthew Lee); the zod mirror (`schemas.ts` `TouchKeyProvenanceSchema` + drift guard) was updated in the same change (Art. I drift guard holds). |
| **G-II — executable IR mutation shape** | II | **RESOLVED (#822, 2026-06-28)** | The `mutate?(value, ctx: MutateContext): Partial<KeyboardIR>` shape is ratified in `survey/types.ts`. T000 re-validated all 5 in-scope modules' `writes` `IRPath`s against the ratified `KeyboardIR` — `header.bcp47`, `header.name`, `header.copyright`, `stores[*]` all resolve, **no shape drift**. FR-003 fail-fast assertion guards at runtime (T008/T014). |
| **G-VI — cross-boundary §18 coordination** | VI | **RESOLVED (#822, 2026-06-28)** | The locked-surface edit landed in #822 with the §18 coordination note recorded (FR-011, SC-010); studio-side work stays in the front-end boundary. |

All three formerly-open gate items are **RESOLVED**. Articles III/IV/V/VII/VIII pass cleanly. **This feature is ready-to-implement; T003–T018 are ungated.**
