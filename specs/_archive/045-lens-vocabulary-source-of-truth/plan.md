# Implementation Plan: Lens-Vocabulary Single Source of Truth

**Branch**: `045-lens-vocabulary-source-of-truth` | **Date**: 2026-08-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/045-lens-vocabulary-source-of-truth/spec.md`

## Summary

Two facet-index classifiers (`added-char-count-classifier.ts` for axis A1, `diacritic-mechanism-classifier.ts` for axis A4) hand-redeclare value sets that already exist as canonical types in `packages/contracts/src/axes.ts` (`Scale`, `DiacriticBehavior`). This plan re-homes both onto type aliases of the contracts types (mirroring the pattern axis A7's `spare-key-budget-classifier.ts` already uses correctly against `KeyBudgetBand`), adds two compile-time drift guards (`Expect<AssignableTo<...>>`, the same idiom `schemas.ts` already uses for its zod-vs-type guards), and adds a new runtime lockstep test colocated with the classifiers asserting the YAML `limits.values` for both facets match the contracts enums' member sets. No runtime behavior changes; no new enumeration is authored.

**Plan-shaping discovery**: research (R1) found the spec's own three-facet framing is one facet too wide — axis A7 (`spare-key-budget`) already derives from a contracts type (`KeyBudgetBand`, via a bijective, tested projection function per spec 052 FR-016) and needs no change. The real surface is A1 and A4 only.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), no new dependencies.

**Primary Dependencies**: `@keyboard-studio/contracts` (existing `axes.ts` types — no new export needed). `utilities/facet-index` is a standalone tool (CLAUDE.md) — this feature adds no new workspace-package edge for it, only deepens its existing `@keyboard-studio/contracts` import.

**Storage**: N/A.

**Testing**: vitest, colocated with the two classifiers (existing pattern — every facet-index classifier has a `.test.ts` sibling).

**Target Platform**: Node (facet-index is a build-time/CLI tool, not shipped to the browser).

**Project Type**: Monorepo utility + contracts type change (additive only — no field renamed/removed).

**Performance Goals**: N/A — a type alias and a same-commit assertion test have no runtime cost.

**Constraints**: Byte-identical facet-index build output and strategy-selector recommendations (FR-007) — this is a type-level and YAML-value-set change only, no logic change to either classifier's decision path (`a1Band()`'s banding logic and `classifyDiacriticMechanism()`'s add/replace-site logic are untouched; only the declared return type narrows from `string`/a parallel literal union to the contracts-derived alias).

**Scale/Scope**: 2 classifier files edited (type alias + guard), 2 YAML files unchanged in content (values already correct, no drift found — just newly *checked*), 1 new test file, 0 new contracts exports (aliases reference existing exports).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS (non-interference)** | Resolved by research R6: no `Pattern` field touched; `StrategyId` (a type, not a `Pattern` field) is untouched by this feature's actual A1/A4 scope. |
| II. KeyboardIR is the engine spine | **PASS** | No IR mutation; classifiers remain read-only IR analyzers, unchanged in logic. |
| III. Single working copy | **PASS** | Not touched — build-time tooling, not authoring runtime. |
| IV. Validator layering / one 300ms debounce | **PASS (non-interference)** | Not touched. |
| V. VirtualFS only during authoring | **PASS** | `utilities/facet-index` is offline tooling, not the authoring runtime. |
| VI. Team boundaries | **PASS** | Per spec's own Team Boundaries section: contracts types are joint engine+content; the facet-index classifiers and YAMLs are Content-owned, consistent with existing ownership. |
| VII. Out of scope for v1 | **PASS** | Not touched. |
| VIII. House conventions | **PASS** | No emoji; commit will follow `<prefix>(<area>)`. |

**No violations. Complexity Tracking not required.**

**Spec's proposed new Constitution Article/Article-I-extension (spec.md's "Constitution check (candidate gate)" section)**: not adopted as a new mechanical gate in this pass — the compile-time guard + runtime lockstep test this plan adds are the enforcement mechanism FR-005/FR-006 already specify; codifying it as a standing Article is a documentation decision for `.specify/memory/constitution.md`'s own maintainers (per CLAUDE.md's Article amendment policy — "single-reviewer approval" for prose, but constitution edits are typically batched with the spec-signoff ledger rather than done inline in a feature plan). Flagged here rather than done silently.

## Project Structure

### Documentation (this feature)

```text
specs/045-lens-vocabulary-source-of-truth/
├── plan.md              # This file
├── research.md          # Phase 0 output
└── data-model.md        # Phase 1 output
```

(No `contracts/` directory — this feature adds no new API surface a consumer codes against; it narrows an existing internal type. See data-model.md for the two type-alias "contracts" instead.)

### Source Code (repository root)

```text
utilities/facet-index/
├── added-char-count-classifier.ts       # EDIT: `A1Band` becomes `type A1Band = Scale;` (import from contracts),
│                                         #   add `type _A1BandGuard = Expect<AssignableTo<A1Band, Scale>>;`
├── diacritic-mechanism-classifier.ts     # EDIT: introduce `type A4Value = DiacriticBehavior;` (import from
│                                         #   contracts), change `let value: string` to `let value: A4Value`,
│                                         #   add `type _A4ValueGuard = Expect<AssignableTo<A4Value, DiacriticBehavior>>;`
├── spare-key-budget-classifier.ts        # UNCHANGED (already correct — research R1)
└── lens-vocabulary-lockstep.test.ts      # NEW: runtime lockstep test — YAML limits.values for
                                          #   diacritic-mechanism.yaml and added-char-count.yaml match
                                          #   DiacriticBehavior/Scale's member sets exactly

content/keyboard-facets/
├── diacritic-mechanism.yaml   # UNCHANGED content (values already correct); now covered by the new test
└── added-char-count.yaml      # UNCHANGED content (values already correct); now covered by the new test

packages/contracts/src/axes.ts   # UNCHANGED — already the source of truth (FR-001 forbids a new enum here)
```

**Structure Decision**: Single-utility change, confined to `utilities/facet-index/`. No cross-package edits; `@keyboard-studio/contracts` is consumed (types only) but not modified — satisfying FR-001/FR-002's "must not author a new or parallel enumeration."
