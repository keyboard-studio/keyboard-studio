# Implementation Plan: KeyboardIR `mutate` seam + touch propagation

**Branch**: `km/mutate-seam-touch-propagation` | **Date**: 2026-06-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-mutate-seam-touch-propagation/spec.md`

> ## ⚠️ PRECONDITION — THIS PLAN IS PROVISIONAL AND GATED (NOT READY-TO-IMPLEMENT)
>
> The feature spec is **DESIGN-ONLY / BLOCKED** on the engine mutation contract **#5b / #232** (spec Dependency Gate, FR-001, Q1=A). That contract has **NOT landed**. This `plan.md` (and the accompanying `tasks.md`) were generated **ahead of the gate, on explicit author direction (Matthew Lee)**, so the design is ready the moment the contract ratifies — **it does not authorize implementation.**
>
> Everything below is planned against the **proposed / anticipated** `mutate` contract shape described in the spec:
> a **pure** `mutate(value, ctx): Partial<KeyboardIR>` that the reducer applies, runtime-asserting the patch touches only the module's declared `writes` paths, **idempotent** on re-apply, applied as a **path-scoped deep merge** at the declared `IRPath` locations.
>
> **Before any task is executed, this plan MUST be re-validated against the *ratified* IR/contract shape from #5b/#232.** A `writes`/IR-shape mismatch is the §8-named risk this phase carries (spec Edge Cases, FR-003). The two Constitution gates that cannot be fully closed until that ratification — **Article I/§18 contracts MAJOR bump (needs the joint engine+content session)** and **Article II IR-shape finalization** — are recorded as **flagged-pending** in the Constitution Check below, not silently passed. Do **not** mark this feature ready-to-implement until those items resolve.

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
- **GATED on #5b/#232** — `mutate()` cannot ship until the engine mutation contract ratifies; plan must be re-validated against the ratified shape (FR-001).
- Strict-TS explicit-extension imports — the provenance re-export and any moved code update specifiers including the extension.
- Flag **off** ⇒ byte-identical to P4b; **zero** `mutate()` executes (FR-016, SC-008).
- Fail-fast whole-patch rejection on undeclared-`writes`, in **all** builds (Q11) — not a dev-only assert.
- Path-scoped deep merge — never a shallow top-level branch replace (Q9).
- Article IV — no second debounce timer / parallel validation path when wiring the real validator (FR-018).
- Article VII — touch is seeded from the locked physical layout; re-propagation is a propagation/merge over the physical-derived substrate, never touch-first authoring.

**Scale/Scope**: 1 contract field added (`TouchKeyIR` provenance) → contracts MAJOR bump. `mutate?` stub → executed pure function. 5 non-empty-`writes` identity/header question modules + the carve/add shell (which carries the strategy-bearing writes) converted (≈6 write-surface conversions). 6 retired direct `workingCopyStore` carve mutators + add-gallery direct writes. 1 reducer patch-apply path (path-scoped deep merge + containment assertion). 1 re-propagation driver off `staleSteps`. 1 global flag. 1 real per-spine-prefix validator replacing C4's proxy. New provenance-tagged fixtures + reuse of existing IR fixtures.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature is **design-only / BLOCKED**. The gate is evaluated against the **anticipated** #5b/#232 contract shape. Two articles **cannot be fully closed** until that contract ratifies and the §18 joint session runs; per author direction those are recorded as **FLAGGED-PENDING with a named resolution path** (not silently passed, and not used to block writing the plan).

| Article | Gate | Verdict |
|---|---|---|
| **I. Pattern schema is a locked contract** | Does this rename/retype/remove a `Pattern` field or its zod mirror? Does it edit a locked `packages/contracts` surface? | **FLAGGED-PENDING (gate item G-I).** No `Pattern` field is renamed/retyped/removed (Assumptions confirm this). **But** this feature **adds a provenance field to the locked `TouchKeyIR` contract** and bumps `@keyboard-studio/contracts` **MAJOR** (FR-008/-011). Per Art. I / §18 that requires a **joint engine+content session**, which has **not** occurred. **Resolution path**: hold the contract edit until #5b/#232 ratifies the IR shape and the §18 joint session is convened and recorded; the zod mirror (`packages/contracts/src/schemas.ts`) MUST be updated in the same change as the type (Art. I drift guard). |
| **II. KeyboardIR is the engine spine** | Does code operate on raw `.kmn` instead of IR, or drop opaque fragments? Is the IR write surface real? | **FLAGGED-PENDING (gate item G-II).** All writes go through the typed IR via `mutate()` → reducer patch-merge; nothing touches raw `.kmn`; opaque fragments are untouched. **But** the executable mutation surface is exactly what #5b/#232 ratifies — the anticipated pure-patch shape is **not yet final**, so `writes`/IR-shape conformance can only be *typecheck-asserted against the proposed shape today*. **Resolution path**: re-validate the `writes` `IRPath`s and patch shape against the ratified `KeyboardIR` before executing tasks (FR-001/-003; §8 risk). The FR-003 fail-fast containment assertion is the runtime guard once the shape is fixed. |
| **III. Single persistent working copy** | Does it add a second working copy or intermediate serialization? | **PASS.** `mutate()` returns a *patch* the existing reducer applies to the one working copy; no second copy, no intermediate serialization. Provenance rides on that copy and is serialized only at output. Re-propagation mutates the same copy in place via the reducer. |
| **IV. Validator layering is fixed (one 300 ms debounce)** | Does it add a second debounce or a parallel validation path? | **PASS (with note).** The real per-spine-prefix validator (FR-017) runs **within** the existing single validation path / debounce cycle (D3); shippability stays **distinct from** inputs-satisfiability (FR-018) but introduces **no** second debounce timer and **no** parallel path. Tasks explicitly forbid a new timer. |
| **V. VirtualFS only during authoring** | Does it write to host disk during authoring? | **PASS.** No new I/O; all state stays in-memory; output serialization unchanged. |
| **VI. Team boundaries** | Which team owns this, and does it stay in bounds? | **FLAGGED-PENDING (gate item G-VI, same root as G-I).** Spans the **Engine** boundary (the `KeyboardIR`/`TouchKeyIR` contract + validator wiring) **and** the studio survey/editor surface. The contracts MAJOR bump touches a locked Engine surface and **requires the §18 joint engine+content session** before landing. **Resolution path**: convene + record the joint session as part of the MAJOR bump (FR-011); studio-side `mutate()` conversion and re-propagation stay within the front-end boundary. |
| **VII. Out of scope for v1** | Does it implement any §16 forbidden item? | **PASS.** No CJK/Ethiopic reorder, no LDML, no touch-first / reverse touch→physical authoring (FR-019; re-propagation seeds touch from the locked physical layout, never the reverse), no multi-source merge, no publishing paths, no flow-map editor, no library/reserve deletion. |
| **VIII. House conventions** | Console emoji? backticked file refs in user text? issue numbers in code? commit style? | **PASS.** No console emoji; provenance tags are typed string literals, not emoji; issue numbers (#5b/#232) are cross-linked in spec/plan/commit prose, **not** embedded in shipped code/comments (Art. VIII); commits follow `<prefix>(<area>): …`. |

**Initial Constitution Check: PASS on Articles III, IV, V, VII, VIII; FLAGGED-PENDING on Articles I, II, VI (gate items G-I, G-II, G-VI).** The flagged items are the direct consequence of the spec's design-only/BLOCKED status (Q1=A) and resolve when #5b/#232 ratifies and the §18 joint session runs. They are tracked in **Complexity / Gate Tracking** below. The plan is intentionally written ready-but-gated; **it does not authorize implementation** while G-I/G-II/G-VI are open.

*Post-Design re-check (after Phase 1):* unchanged — the design artifacts (data-model, contracts, quickstart) are all written against the *anticipated* shape and carry the same provisional caveat; no new violation introduced, the three gate items remain the only open gates.

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

**(EDIT)** marks existing files changed; **(NEW)** marks net-new; **[GATED on #5b/#232]** marks edits that cannot land until the contract ratifies.

```text
packages/contracts/src/
  keyboard-ir.ts                 # (EDIT) [GATED] add provenance field to TouchKeyIR (Q2/FR-008)
  schemas.ts                     # (EDIT) [GATED] mirror the provenance field in the zod schema (Art. I drift guard)
  index.ts                       # (EDIT) [GATED] export the provenance type for editor re-export
  package.json                   # (EDIT) [GATED] MAJOR version bump (FR-011)

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
      provenance.ts              # (EDIT) becomes a RE-EXPORT of the contracts provenance type (FR-008)
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

**Structure Decision**: A cross-boundary change. The contract edit (provenance on `TouchKeyIR` + MAJOR bump) is confined to `packages/contracts/src/{keyboard-ir,schemas,index}.ts` + `package.json` and is **[GATED]**. The studio side adds `steps/mutateApply.ts`, `steps/repropagate.ts`, `flags/mutateFlag.ts`, edits `survey/types.ts`, `steps/reducer.ts`, the 5 non-empty-`writes` modules, the carve/add editors (which carry the strategy-bearing writes), `touchSuggest`, and `dashboard/completeness.ts`. Per-question tests stay in the mirrored `packages/studio/tests/survey/questions/<phase>/` tree (Q7); the provenance round-trip test lives in `packages/contracts`.

## Complexity / Gate Tracking

> Filled because the Constitution Check has **flagged-pending** gate items (consequence of the spec's BLOCKED status). These are **not** unjustified violations — they are gates that resolve on #5b/#232 ratification + the §18 joint session. The plan is written ready-but-gated by author direction.

| Gate item | Article | Status | Why it cannot close now | Resolution path |
|---|---|---|---|---|
| **G-I — `TouchKeyIR` provenance field + contracts MAJOR bump** | I / §18 | FLAGGED-PENDING | Editing a locked `packages/contracts` surface + a MAJOR bump requires a **joint engine+content session** (Art. I / §18) that has not occurred; the IR shape isn't ratified. | Convene + record the §18 joint session as part of the MAJOR bump (FR-011); update the zod mirror in the same change (Art. I drift guard); land only after #5b/#232. |
| **G-II — executable IR mutation shape not ratified** | II | FLAGGED-PENDING | `mutate()` is the §8 risk: declaring `writes`/patch shape that may not match the *real* IR. Only #5b/#232 confirms the shape; today it's typecheck-asserted against the *proposed* shape. | Re-validate `writes` `IRPath`s + patch shape against the ratified `KeyboardIR` before executing tasks (FR-001/-003). FR-003 fail-fast assertion guards at runtime once fixed. |
| **G-VI — cross-boundary §18 coordination** | VI | FLAGGED-PENDING | The change spans Engine (contract + validator) and studio; the locked-surface edit needs the §18 joint engine+content session. | Same joint session as G-I; record the coordination note (FR-011, SC-010). Studio-side work stays in front-end boundary. |

These three gate items are the **only** open gates. Articles III/IV/V/VII/VIII pass cleanly. **Do not mark this feature ready-to-implement until G-I, G-II, and G-VI are resolved.**
