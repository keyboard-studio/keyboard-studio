# Implementation Plan: Carve gallery trim proposals compare produced characters to the orthography (with cased-letter pairing)

**Branch**: `051-carve-orthography-trim` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/051-carve-orthography-trim/spec.md](spec.md)

## Summary

Four slices, in dependency order. The good news from Phase 0 is that the produced-vs-input **domain** is already
correct — `buildProducedSet` walks `rule.output` only, so FR-001/FR-002 hold today and need regression tests, not
new code. The defects are downstream of it.

1. **Narrow the collateral guard (US1/US2, the ɨ fix).** `coordinatedDropHitsNeededChar`
   ([irToCarveNodes.ts:1506](../../packages/studio/src/lib/irToCarveNodes.ts)) currently shields a trim whenever
   *any* coordinated partner slot holds a needed character. FR-003 narrows that to a conjunction: the partner must
   be an **output** store slot **and** the needed character it holds must have **no other producer**. Both facts
   are engine-side (NFR-004): `analyzeStores` gains an `asIndexOutputTarget` usage flag, and a new
   `producerCountOf` answers the second.
2. **Split contributor roles (the enabling change).** `collectCharContributors` deliberately merges input-store and
   output-store slots into one flat `storeSlotIds` array, so no caller can currently ask "is this slot a
   producer?". A parallel, **additive** `storeSlots: { slotId, role }[]` field carries the role; `storeSlotIds`
   stays as-is so every existing call site keeps working unchanged.
3. **Make every acted-on trim visible (US3).** Establish the invariant *trimmed contributor set ≡ the set of tiles
   that flip* as an executable test, and route every non-applying trim to an explicit reason (FR-008). This slice
   starts with a **reproduction**, not a patch — see [research.md](research.md) §R5.
4. **Case pairing in carve (US4, P2).** A `caseGroupFor(char, producedSet, bcp47)` resolver over the produced set,
   built on the engine's existing `caseCounterpart`, with uppercase modelled as a **reference set** (FR-013) so a
   shared uppercase retires only when its last lowercase referent is trimmed.

Slices 1–3 are P1 and independently shippable; slice 4 is P2 and sits on top of a correct slice 1.

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: `@keyboard-studio/engine` (`analyzeStores`, `classifyStoreSlotEdit`,
`collectCharContributors`, `applyStoreSlotRemovals`, `caseCounterpart`, `deriveCarveNeededSet`,
`isCharCoveredForLocale`), `@keyboard-studio/contracts` (`buildProducedSet`, `KeyboardIR`), React 18 + Vite
(`CarveGallery`, `irToCarveNodes`)

**Storage**: N/A — working-copy IR + `deletedNodeIds` / `deletedItemIds` in `workingCopyStore` (Article V)

**Testing**: vitest in both packages; the Cameroon QWERTY corpus keyboard from the sibling `../keyboards` checkout
as the US1 fixture (see [docs/keyboard-index.md](../../docs/keyboard-index.md))

**Target Platform**: Browser SPA + the engine package it consumes

**Project Type**: TypeScript monorepo — engine library + React SPA

**Performance Goals**: No regression against the existing `#931` hoisting. `analyzeStores` stays one scan per IR;
the new producer-count must be computed from a **single** pre-pass over the IR, not per candidate character —
otherwise the proposal loop goes O(chars × rules). See [research.md](research.md) §R3.

**Constraints**: No new debounce or validation timer (NFR-002 / Article IV). The slot-id contract
(`<storeNodeId>#<itemsIndex>`) and the `applyStoreSlotRemovals` coordinated-drop algorithm are frozen (NFR-003) —
this feature changes only which slots are *proposed*, never how a confirmed drop is *applied*. Conservative when
the needed set is empty (FR-009).

**Scale/Scope**: 2 engine files changed (+1 new), 2 studio files changed (+1 new), ~4 new user-facing strings.
The bulk of the work is tests: 4 user stories × 3–6 acceptance scenarios each.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Notes |
|---------|---------|-------|
| **I. Pattern schema is a locked contract** | PASS | `Pattern` / `Criterion` untouched. `CharContributors` and `StoreUsageFlags` are **engine** interfaces, not `packages/contracts` locked types, and both changes are purely additive (a new optional field / a new boolean). `buildProducedSet` (which *is* in contracts) is read-only here. |
| **II. KeyboardIR is the engine spine** | PASS | Everything operates on the typed IR. Opaque `RawKmnFragment` producers stay un-trimmable and are reported as blocked (spec Edge Cases) — the existing `contributors.blocked` path, unchanged. |
| **III. Single persistent working copy** | PASS | Trims are recorded as `deletedNodeIds` / `deletedItemIds` on the one working copy; serialization stays at output. |
| **IV. Validator layering / one 300 ms debounce** | PASS | Explicitly restated as NFR-002. Proposal recomputation stays a pure `useMemo` pass over the IR — no timer, no diagnostics. |
| **V. VirtualFS only during authoring** | PASS | No host-disk writes. |
| **VI. Team boundaries** | PASS with a note | Engine team owns the IR facts (store role, producer count, case pairing) and the carve UI. **NFR-004 as written says "No studio→engine import", which inverts the actual invariant** — the studio imports the engine everywhere (`irToCarveNodes.ts:15`), and it is the *engine* that must not import the studio (stated in [applyStoreSlotRemovals.ts:234](../../packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts)). Planned to the real invariant; flagged for a spec wording fix. One content-team item: the FR-005 informational copy (OQ-2). |
| **VII. Out of scope for v1** | PASS | No CJK/Ethiopic reorder, no LDML, no touch-first authoring. Caseless scripts fall out via `caseCounterpart` returning null. |
| **VIII. House conventions** | PASS | New strings get `editor.carve.*` message ids. **Existing violation inherited:** the collateral warning strings at [CarveGallery.tsx:213-214](../../packages/studio/src/editors/carve/CarveGallery.tsx) begin with a `⚠` emoji. FR-005 rewrites that exact copy, so the emoji is dropped in the same change rather than carried forward. |

**Result: PASS — no violations requiring justification; the Complexity Tracking table is not filled in.**

**Post-Phase-1 re-check**: PASS, unchanged. Phase 1 added one engine module (`producerIndex.ts`), two additive
interface fields, and one studio resolver. No locked type moved. The one judgement call — putting the case-pair
resolver in the studio rather than the engine — is recorded in [research.md](research.md) §R6.

## Project Structure

### Documentation (this feature)

```text
specs/051-carve-orthography-trim/
├── spec.md              # Feature specification (input)
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1..R7, and OQ-1..OQ-5 resolved
├── data-model.md        # Phase 1 — StoreRole, ProducerIndex, CaseGroup, the trim unit
├── quickstart.md        # Phase 1 — runnable validation per user story
├── contracts/
│   ├── collateral-guard.md   # FR-003's two-part test + the engine facts it consumes
│   └── case-pairing.md       # FR-011..FR-015, the reference-set model
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/engine/src/pattern-apply/
├── applyStoreSlotRemovals.ts     # CHANGED — StoreUsageFlags gains asIndexOutputTarget; analyzeStores sets it
├── collectCharContributors.ts    # CHANGED — additive `storeSlots: { slotId, role }[]`; storeSlotIds unchanged
├── producerIndex.ts              # NEW — buildProducerIndex(ir): char -> producer count, one pass (FR-003b)
├── producerIndex.test.ts         # NEW
└── applyStoreSlotRemovals.ts / collectCharContributors.ts tests — CHANGED (additive assertions only)

packages/engine/src/index.ts      # CHANGED — export buildProducerIndex + the StoreRole type

packages/studio/src/lib/
├── irToCarveNodes.ts             # CHANGED — coordinatedDropHitsNeededChar becomes the FR-003 conjunction;
│                                 #           coordinatedCollateralForSlots gains role + isLost per partner;
│                                 #           recommendedRemovalChars threads the producer index
└── carveCasePairs.ts             # NEW — caseGroupFor / uppercase reference sets (US4)

packages/studio/src/editors/carve/
├── CarveGallery.tsx              # CHANGED — informational vs. warning collateral copy (FR-005);
│                                 #           explicit no-op reason (FR-008); paired proposal rows (FR-014)
└── *.test.tsx                    # CHANGED — per-story coverage

packages/studio/src/locales/{en,fr}/   # CHANGED — new/reworded message ids
```

**Structure Decision**: Existing layout, no new package. The split follows NFR-004's *intent*: facts about the IR
(store role, producer count) go in `packages/engine/src/pattern-apply/`, beside `analyzeStores` and
`collectCharContributors` which already own that territory; the guard *policy* and all presentation stay in
`packages/studio/src/lib/irToCarveNodes.ts`, where they already live. The case-pair resolver is studio-side —
[research.md](research.md) §R6 explains why.

## Complexity Tracking

> Not required — the Constitution Check passed with no violations.
