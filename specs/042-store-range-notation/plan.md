# Implementation Plan: KMN store range notation (`X .. Y`)

**Branch**: `041-construction-facet-classifiers` (rides the open spec 041 branch / PR #1190 per owner instruction — not its own branch) | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/042-store-range-notation/spec.md](spec.md)

## Summary

The codec does not model Keyman range notation (`U+XXXX .. U+YYYY`) in a store body, breaking in two ways: a BMP range parses to only its two endpoints plus a stray `{raw:".."}` item (interior silently dropped), and an SMP range trips the `smp-literal` guard and discards the whole store to a zero-item `RawKmnFragment`. `buildProducedSet` — the single shared "what can this keyboard produce" utility — therefore under-counts or empties the produced set for **53 keyboards / 204 store lines**, the root cause of the residual spec-041 `undetermined` facet values (46 `encoding`, 15 `casing`).

**Technical approach (resolved in spec clarifications):** expand ranges **eagerly at parse time** into individual `{kind:"char"}` store items (IR option A — no `@keyboard-studio/contracts` change, no major bump, no joint session). The fix lands entirely in `engine/src/codec` (`parse.ts` `parseStoreItems` for expansion; `emit.ts` `emitStoreItems` for re-collapsing contiguous ascending runs back to `X .. Y` so authored `.kmn` stays compact). Every `buildProducedSet` consumer inherits the corrected set with zero changes on its side (FR-011). Malformed/descending ranges preserve-opaque with a diagnostic reason rather than fabricate a wrong interior (FR-006). Scope is **store bodies only** (FR-009).

## Technical Context

**Language/Version**: TypeScript 5.x (ESM, `NodeNext`), Node ≥ 20

**Primary Dependencies**: `@keyboard-studio/contracts` (IR types — consumed, **not modified**); `@keyboard-studio/engine` codec (`parse.ts`, `emit.ts`, `tokenize.ts`); downstream consumers `buildProducedSet` (contracts), engine inventory diff, `@keymanapp/keyboard-lint` §18.6, `utilities/facet-index` classifiers (all inherit the fix, none edited)

**Storage**: N/A (pure in-memory IR transform)

**Testing**: vitest (`packages/engine` codec suite — `parse.test.ts`, `emit.test.ts`, `roundtrip.test.ts`; `packages/contracts` `producedSet` tests); corpus round-trip harness over the sibling `../keyboards` checkout; facet-index determinism + `facet-index-lint`

**Target Platform**: Browser-safe library code (no I/O in codec / producedSet)

**Project Type**: Compiler/codec enhancement within a pnpm monorepo (engine package)

**Performance Goals**: Range expansion is O(cardinality); corpus max ≈ 800 cp (`U+E000 .. U+E317`). Parse-time cost negligible; no cap needed (FR-007)

**Constraints**: No `packages/contracts` schema change (Article I gate stays green — IR option A); semantic round-trip only, byte-identical explicitly out of scope (Article VII); expansion must be deterministic (SC-004 byte-identical rebuilds)

**Scale/Scope**: 53 keyboards / 204 store range lines in the corpus; the change is ~2 codec functions (`parseStoreItems`, `emitStoreItems`) + new tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see "Post-Design re-check".*

| Article | Verdict | Notes |
|---------|---------|-------|
| **I. Pattern schema is a locked contract** | **PASS** | No `packages/contracts` type or zod-schema change. IR option A expands to the existing `{kind:"char"}` `StoreItem` variant, which already holds a full codepoint string (incl. astral). No `@keyboard-studio/contracts` major bump, no joint engine+content session (spec FR-010 / Key Entities). |
| **II. KeyboardIR is the engine spine** | **PASS** | Change is squarely in the codec (`parse → …→ emit`) operating on the IR. Removes a class of *silent drop* (BMP interior) and a class of *over-opaquing* (SMP range → empty fragment) — moves the codec **toward** the "never silently dropped" invariant, not away. Malformed ranges stay preserved-opaque with a reason (Article II compliant). |
| **III. Single persistent working copy** | **PASS** | No change to instantiation/serialization lifecycle. |
| **IV. Validator layering** | **PASS** | No validator change, no new debounce/validation path. Layer C §18.6 coverage benefits transitively via the corrected produced set. |
| **V. VirtualFS only during authoring** | **PASS** | No host-disk writes; codec is pure. |
| **VI. Team boundaries** | **PASS** | **Engine team** owns the codec, `buildProducedSet`, and the facet-index utility. Wholly within the engine boundary; no content-owned surface (pattern library / survey / gallery / prompts) touched. |
| **VII. Out of scope for v1** | **PASS** | Bar is **semantic** round-trip (re-parsed codepoint set identical), byte-identical stays out of scope (FR-008). No LDML/CJK/mobile/hosting surface. |
| **VIII. House conventions** | **PASS** | No console output added; commit rides `feat(engine):` prefix; no in-code issue numbers. |

**No violations — Complexity Tracking table intentionally empty.**

## Project Structure

### Documentation (this feature)

```text
specs/042-store-range-notation/
├── plan.md              # This file
├── research.md          # Phase 0 — kmcmplib range semantics + design decisions
├── data-model.md        # Phase 1 — IR store-item model + range-expansion contract
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   └── codec-range.md   # Phase 1 — parse/emit behavioral contract (grammar-level)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
packages/engine/src/codec/
├── parse.ts             # EDIT — parseStoreItems: detect `..` range, expand inclusive
│                        #        ascending; range-detection runs BEFORE the isSmpLiteral
│                        #        early-bail so astral ranges expand instead of opaquing;
│                        #        descending/malformed → preserve-opaque + new reason
├── emit.ts              # EDIT — emitStoreItems: re-collapse a contiguous ascending run
│                        #        of >= N char items back to `X .. Y` notation (FR-008)
├── opaque-reasons.ts    # EDIT — add DESCENDING_RANGE / MALFORMED_RANGE reason strings
├── parse.test.ts        # EDIT/ADD — BMP, SMP, mixed range+singleton, quoted endpoints,
│                        #            whitespace variants, BMP↔SMP straddle, degenerate forms
├── emit.test.ts         # ADD — re-collapse round of ranges; threshold behavior
└── roundtrip.test.ts    # ADD — parse→emit→re-parse codepoint-set stability for ranges

packages/contracts/src/ir/
└── producedSet.test.ts  # ADD — produced-set includes full range interior (no source edit)

# Consumed unchanged (verify-only, no edits): buildProducedSet, engine inventory diff,
# keyboard-lint §18.6, utilities/facet-index classifiers.
```

**Structure Decision**: Single-package (engine) codec change plus a contracts-side test. The two behavioral edits (`parseStoreItems` expand, `emitStoreItems` re-collapse) are the whole functional surface; everything else is test coverage and a two-string addition to the opaque-reason enum. No new files in `packages/*`; feature docs live under the spec folder.

## Complexity Tracking

> No Constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design re-check (after Phase 1)

Re-evaluated after data-model / contracts were written: no drift. The design keeps IR option A (no contracts change → Article I stays PASS), confines all logic to `engine/src/codec` (Article II/VI PASS), and holds the semantic-round-trip bar (Article VII PASS). The only enum growth is two new `OPAQUE_REASONS` strings for the fail-safe path — additive, no locked-type change. **Constitution Check remains fully green.**
