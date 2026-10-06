# Implementation Plan: Facet Transform Engine

**Branch**: `039-facet-transform` | **Date**: 2026-07-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/039-facet-transform/spec.md](spec.md)

## Summary

Build an **engine capability** that switches a keyboard base from one *source-construction facet* value to another
on the single persistent working copy — via KeyboardIR mutation, propose-then-confirm, serialized only at output.
The feature **owns the per-pair value-transition matrix + migration rules** deferred out of the source-facet model
(split-C in [docs/source-facets-design.md](../../docs/source-facets-design.md)); it *consumes* the source-facet
measurements produced by [spec 037](../037-facet-classifiers/spec.md) and stored per [spec 036](../036-keyboard-facet-index/spec.md).

Every transform declares a **transformImpactClass** — behavior-preserving (byte-identical output, invertible),
ux-changing (input UX changes, output may stay identical, may be lossy per direction), output-changing (emitted
bytes change, needs a coordinated multi-rule migration) — and gate-class facets are refused. The engine treats
measured exception sites by **cause tag** (principled-split preserved by default, capacity-forced offered as
consolidation, gap-omission offered as a fix) and supports partial acceptance at exception-site granularity.

**Technical approach** (grounded in current code — see [research.md](research.md)):

- **New engine module `packages/engine/src/facet-transform/`**, exported from the package barrel after the
  `pattern-apply` block. Pure IR→IR migration functions (copy-return, never in-place — the `carveFilterIr` precedent),
  each wrapped by a thin VFS/working-copy projection step (the `applyCarveToVfs` precedent) and wired into the studio's
  `useWorkingCopyTransform` pipeline + a `setWorkingIR`-style incremental store write (research D1/D2).
- **Touch mechanisms (longpress→flick) operate on `KeyboardIR.touchLayout` (`TouchLayoutIR`)**, not `.kmn` rules —
  they are invisible to the codec/recognizer (design brief §2). The transform reads/writes `TouchKeyIR.{sk,flick,multitap}`
  through the consolidated `parseTouchLayout`/`emitTouchLayout` contract and sets `TouchKeyProvenance` explicitly per
  rewritten key so it never silently clobbers hand-set keys (research D3).
- **Measurement input is injected, not loaded by the engine** (the glottolog-bridge contracts-only precedent): the
  engine takes the 037/036 `source.*` measurement (dominant value + consistency + exception sites + cause tags) as a
  parameter, keeping it free of the non-package `utilities/facet-index` path (research D4).
- **Pre-commit gate** compiles/validates a *transient candidate* IR (discarded after the check — not a second persistent
  working copy) by calling the existing `validateWithOracle`/`compile` exactly once, synchronously with respect to the
  Apply action — undebounced, reusing the single validation implementation, no second timer (research D8/D9).
- **Parity + invertibility** for behavior-preserving transforms: `buildProducedSet` equality as a fast pre-check, then
  compile-to-artifact + `simulate` keystroke equivalence over the IR-derived `generateCorpus`; invertibility via
  `assertSemanticEquivalence(irBefore, T⁻¹(T(irBefore)))` (research D6/D7).
- **Starter transition coverage is an honestly-bounded subset** (FR-004): four supported pairs across the three impact
  classes serving US1/US2/US3, with the riskier/ambiguous pairs registered as *declined-with-reason* from day one
  (research D10) so the decline path is exercised, not silently absent.

## Technical Context

**Language/Version**: TypeScript (ESM), Node ≥ 20, pnpm 9. Engine module runs in the SPA (WASM `kmcmplib` oracle
available in-browser) and in Node/vitest.

**Primary Dependencies** (all existing exports — no new runtime dependency):
- `parseKmn` / `emit` — codec (`packages/engine/src/codec`).
- `parseTouchLayout` / `emitTouchLayout` — touch layout (`packages/engine/src/codec/parse-touch.ts` → contracts
  `parseTouchLayoutString`, canonical post-#354).
- `compile` (`packages/engine/src/compiler/index.ts:210`), `validateWithOracle` / `runAllChecks`
  (`packages/engine/src/validator/{oracle,index}.ts`), `simulate` (`packages/engine/src/simulator/index.ts:166`),
  `generateCorpus` (`packages/engine/src/validator/corpus.ts`).
- `KeyboardIR`, `TouchLayoutIR`, `RawKmnFragment` (`packages/contracts/src/keyboard-ir.ts`),
  `buildProducedSet` (`packages/contracts/src/ir/producedSet.ts:210`),
  `assertSemanticEquivalence` (`packages/contracts/src/keyboardIRRoundTrip.ts:86`),
  `OPAQUE_REASONS` + `checkOpaqueFeatureInventory` (I4) for opaque-region reporting.
- Studio wiring: `workingCopyStore` (`setWorkingIR`, `setIrAxes`, `seedIrAxesFromBaseIr`),
  `useWorkingCopyTransform`, the single `useDebounce`/`useValidator` cycle (unchanged).

**Storage**: No new storage. Authoring is in-memory (VirtualFS), serialized only at output (Article V). The `source.*`
measurement it consumes is produced by 037 and committed in `docs/keyboard-facet-index.json` (036); 039 receives it as
injected input rather than reading the file itself.

**Testing**: vitest fixture tests inside `packages/engine/src/facet-transform/*.test.ts` — parity (compile+simulate
equivalence, SC-001), invertibility (`assertSemanticEquivalence` round-trip), cause-tag preservation (SC-004),
opaque-fragment integrity (SC-005), compile-regression decline (SC-006), and the FR-004 decline-with-reason path.
Studio propose-then-confirm UI is covered by component tests; a Playwright walk is deferred (the E2E prelude is
currently blocked — see CLAUDE.md E2E status).

**Target Platform**: Studio SPA (React + Vite) + engine; WASM `kmcmplib` in-browser and in Node.

**Project Type**: Engine module (working-copy mutation orchestration) + studio UI wiring. Not a service, not an
offline pipeline.

**Performance Goals**: A transform proposal (measure → resolve transition → build preview) and its pre-commit
gate (one compile + bounded-corpus simulate) complete within an interactive budget; the parity corpus is the
existing bounded `generateCorpus` (deadkey-depth 3 × 6 modifier sets), not an unbounded enumeration.

**Constraints**: Propose-then-confirm always (§3c) — no silent transforms (FR-002). Single 300 ms debounce cycle
untouched (Article IV) — the pre-commit gate is a one-shot undebounced call. Behavior-preserving transforms MUST be
parity-verified and invertible (FR-007). Opaque `RawKmnFragment` never silently dropped/rewritten (FR-009). A
transform that breaks compile is never committed (FR-010).

**Scale/Scope**: v1 covers a bounded starter set of four supported transitions across all three impact classes
(US1/US2/US3) plus the declined-with-reason registry; the transition matrix is designed to extend without schema
change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS** | No `Pattern`/`Criterion` type is edited. The transition matrix / migration rules are **new engine data** plus content-owned facet fields (design brief §6 — not a locked `packages/contracts` type until an evaluation round). The model explicitly **does not reuse** `StrategyId` / `PrimaryRuleNumber` / the locked §7.2 tree — `houseTargetPolicy` is *modeled on* the §7.2 ordered-decision-table pattern only (research D5; a one-line disclaimer lands in data-model.md). No stop-and-escalate needed. |
| II. KeyboardIR is the engine spine | **PASS** | Every migration operates on the typed `KeyboardIR` (and `TouchLayoutIR`), never raw `.kmn` text, copy-return per the `carveFilterIr` precedent. Opaque `RawKmnFragment` regions are diffed before/after and **reported, never silently dropped** (FR-009/SC-005), reusing I4's `{feature,count}` inventory shape. |
| III. Single persistent working copy | **PASS** | Transforms mutate the one working copy via `setWorkingIR` (object-reference replacement); serialized only at output. The pre-commit compile gate validates a **transient candidate IR that is discarded** after the check — it is not a second persistent working copy, and it is never serialized (research D8). |
| IV. Validator layering / one 300 ms debounce | **PASS** | The gate calls the **existing** `validateWithOracle`/`compile` once, synchronously w.r.t. the Apply action — undebounced, no new timer, no parallel validation *implementation* (a second call site of the one implementation, per Article IV). The transform is **not** a new Layer A/B/C check. Any live-preview parameter field must reuse `useDebounce`, not invent a timer (research D9 caution). |
| V. VirtualFS only during authoring | **PASS** | No host-disk writes during authoring; VFS projection at output only, mirroring `useWorkingCopyTransform`. |
| VI. Team boundaries (§12/§13) | **PASS** | **Engine team** owns the transform engine, transition matrix, migration rules, parity/gate logic (it mutates KeyboardIR). **Content team** owns the `source.*` facet definitions and the `implications` prose the engine composes into proposals — consumed here, not authored here. |
| VII. Out of scope for v1 | **PASS** | No CJK/Ethiopic reorder authoring, no multi-source merge, no survey-editing of opaque fragments, no byte-identical round-trip claim (parity is compile+simulate equivalence, not byte-identity — research D6). Riskier transitions are declined-with-reason, not half-built. |
| VIII. House conventions | **PASS** | `[OK]`/`[WARN]`/`[ERROR]` console output; markdown links in docs; `feat(engine)` commit style; no GitHub issue numbers in shipped code. |

**No violations → Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/039-facet-transform/
├── plan.md              # This file
├── research.md          # Phase 0 — 10 decisions + resolved NEEDS CLARIFICATION (generated)
├── data-model.md        # Phase 1 — FacetTransition / MigrationRule / TransformProposal / HouseTargetPolicyRow (generated)
├── quickstart.md        # Phase 1 — validation scenarios for US1/US2/US3 + decline path (generated)
├── contracts/           # Phase 1 — the transition-matrix + transform-proposal contracts (generated)
│   ├── transition-matrix.contract.md
│   └── transform-proposal.contract.md
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
packages/engine/src/facet-transform/          # NEW — engine-owned transform engine
├── index.ts                                   # barrel: proposeFacetTransform, applyFacetTransform, TRANSITION_MATRIX, types
├── transition-matrix.ts                       # the value-transition matrix (FacetTransition[]) + declined-with-reason rows
├── propose.ts                                 # measurement + transition -> TransformProposal (affected sites by cause tag, preview, implications)
├── house-target-policy.ts                     # ordered decision-table resolver for source.encoding house target + provenance chip
├── migrations/                                # one migration rule per supported transition
│   ├── encoding-spelling.ts                   # US1 - base/combining + within-kind input spelling (behavior-preserving)
│   ├── longpress-to-flick.ts                  # US2 - touch-layout rewrite + derived direction assignment (ux-changing)
│   └── nfd-to-nfc.ts                          # US3 - output rewrite + coordinated backspace-rule rewrite (output-changing)
├── verify.ts                                  # parity (buildProducedSet pre-check + compile+simulate) + invertibility + compile-regression gate + opaque-diff
├── *.test.ts                                  # fixture tests per the Testing section
└── (studio wiring)                            # packages/studio: useWorkingCopyTransform stage + setWorkingIR write + proposal UI

packages/engine/src/index.ts                   # UPDATED - re-export the facet-transform barrel after the pattern-apply block
docs/keyboard-index.md                         # UPDATED - add any newly-cited fixture keyboards (mandatory)
```

**Structure Decision**: The transform engine is **engine-owned code** in a new `packages/engine/src/facet-transform/`
module (Article VI — it mutates KeyboardIR), following the `pattern-apply` precedent: pure IR→IR migration functions
(copy-return) plus thin VFS/store-projection wrappers, with a curated `index.ts` barrel re-exported from the package
root. Touch migrations go through the consolidated `parseTouchLayout`/`emitTouchLayout` contract. The verification/gate
logic **imports** `validateWithOracle`/`compile`/`simulate`/`assertSemanticEquivalence` as black boxes — it does **not**
live inside `packages/engine/src/validator/` (that would blur "validity checks" with "commit decision") and does not
become a new validator-layer check. The `source.*` facet **definitions** and `implications` prose remain content-owned
under `content/facets/source/`.

## Complexity Tracking

> No Constitution violations. Section intentionally empty.
