# Implementation Plan: Bake base-keyboard facets into the working-copy IR

**Branch**: `048-base-facets-in-ir` | **Date**: 2026-08-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/048-base-facets-in-ir/spec.md`

## Summary

Add an optional `facets?: FacetSet` field to `KeyboardIR` (additive, alongside the existing `touchLayout?`/`visualKeyboard?` precedent), populated at working-copy instantiation (both `instantiateFromBase` and `instantiateFromExisting`, in `workingCopyStore.ts`) by a **shared derivation function hoisted out of `utilities/facet-index`** into a workspace package both the offline tool and the browser studio can import — satisfying FR-008's single-source-of-truth requirement structurally, not by convention. First increment covers `casing` only (per the spec's own "incremental, casing first" framing and issue #1347); the accessor/override/provenance mechanism is designed generally so later facets slot in without a redesign.

Key finding that de-risks this feature: `utilities/facet-index/casing-classifier.ts`'s `classifyCasing(ir: KeyboardIR, def: FacetDefinition)` **already operates directly on `KeyboardIR`**, not a separate offline-only representation — the "single shared derivation" FR-008 requires is a hoist, not a re-implementation.

## Constitution Check

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS (non-interference)** | `KeyboardIR` is not the locked `Pattern`; no `Pattern`/`Criterion` field touched. |
| II. KeyboardIR is the engine spine | **PASS** | This feature's entire point is additive IR metadata — `facets?` follows the exact precedent of `touchLayout?`/`visualKeyboard?`. |
| III. Single persistent working copy | **PASS** | Facets are derived once at instantiation and ride the one working copy; no second copy introduced. |
| IV. Validator layering / one 300ms debounce | **PASS (non-interference)** | Not touched. |
| V. VirtualFS only during authoring | **PASS** | Derivation is browser-safe, in-memory, no network/offline-artifact access at runtime (FR-007) — reads only the already-in-memory `KeyboardIR`. |
| VI. Team boundaries | **PASS** | Engine-owned (contracts + engine + studio store wiring). |
| VII. Out of scope for v1 | **PASS** | Not touched. |
| VIII. House conventions | N/A at plan time | Applies at commit time. |
| IX. No survey surface outside the manifest | **PASS (non-interference)** | This feature ships no new survey question/step; UI consumption (e.g. a casing-gate UI) is explicitly out of scope, left to consuming features per spec's Out-of-scope section. |

**No violations.**

## Project Structure

### Documentation (this feature)

```text
specs/048-base-facets-in-ir/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── contracts/
    └── facet-set-api.md      # FacetSet shape + accessor/override API contract
```

### Source Code (repository root)

```text
packages/contracts/src/
├── keyboard-ir.ts       # EDIT: KeyboardIR gains `facets?: FacetSet` (additive, optional,
│                         #   same precedent as touchLayout?/visualKeyboard?)
├── schemas.ts           # EDIT: KeyboardIRSchema is `.passthrough()` (only origin/touchLayout
│                         #   pinned explicitly) -- confirm at implementation time whether an
│                         #   explicit optional facets entry is needed for documentation parity
│                         #   with Article I's drift-guard intent, or whether passthrough already
│                         #   covers it structurally
└── (new) facets.ts       # NEW: FacetSet/FacetValue/FacetProvenance types + the accessor/
                          #   override/clear functions (getFacet, setFacetOverride, clearFacetOverride)

packages/engine/src/ (or a shared location both engine and utilities/facet-index can import)
└── facets/
    └── casing.ts          # NEW (hoisted): the shared casing-derivation function, extracted
                             #   from utilities/facet-index/casing-classifier.ts's classifyCasing()
                             #   core logic -- both the offline tool and the studio import THIS,
                             #   satisfying FR-008 structurally

utilities/facet-index/
└── casing-classifier.ts    # EDIT: classifyCasing() delegates to the hoisted shared function for
                              #   its core casing determination, keeping its own richer
                              #   Categorization wrapper (confidence/evidenceSize/etc.) for the
                              #   offline report -- the hoisted function returns a simpler
                              #   value + derived/undetermined signal, which classifyCasing()
                              #   further enriches for its own output shape

packages/studio/src/stores/
└── workingCopyStore.ts      # EDIT: instantiateFromBase (~line 1458) and instantiateFromExisting
                              #   (~line 1520) both call the shared derivation and attach the
                              #   result as ir.facets before setting the working copy

# Explicit non-goals (see spec.md Out of scope):
#   packages/studio/src/adaptation/evidence.ts (AdaptationEvidenceProvider) -- a distinct,
#     heavier mechanism (spec 038) that reads the FULL offline facet index; unrelated, not touched
#   packages/studio/src/survey/charNormUtils.ts (caseCounterpart) -- spec 049's interim per-
#     character case-pair lookup; answers a different question than a keyboard-level casing
#     facet and is left alone, not superseded by this feature
```

**Structure Decision**: Spans `packages/contracts` (the `facets` field + types), a new shared derivation location reachable by both `packages/engine`/studio and `utilities/facet-index` (the hoist), and `packages/studio/src/stores/workingCopyStore.ts` (the two instantiation call sites). No `.kmn`/`.kps` output change (explicit non-goal).
