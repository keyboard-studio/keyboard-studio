---
description: "Task list for KMN store range notation (X .. Y)"
---

# Tasks: KMN store range notation (`X .. Y`)

**Input**: Design documents from `/specs/042-store-range-notation/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/codec-range.md](contracts/codec-range.md), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — the spec explicitly requires new codec/consumer coverage (SC-005) and corpus round-trip verification (SC-006).

**Organization**: Tasks are grouped by user story. US1 (BMP expansion) is the MVP; US2 (SMP) extends the same mechanism to the astral planes and owns the emit round-trip; US3 hardens the malformed/degenerate fail-safe path.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3 (maps to spec.md user stories)
- File paths are exact and relative to the repo root

## Path Conventions

Single pnpm monorepo. Functional surface is `packages/engine/src/codec/` (parse + emit + opaque reasons), with one consumer-side test in `packages/contracts/src/ir/`. No new files in `packages/*` source; all changes edit existing codec files or add tests alongside them.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a green baseline and locate the exact edit sites before touching code.

- [x] T001 Run `pnpm install` then `pnpm build` (prebuild codegen + engine/contracts build) per [quickstart.md](quickstart.md) Prerequisites, then confirm a green baseline: `pnpm --filter @keyboard-studio/engine test src/codec` and `pnpm --filter @keyboard-studio/contracts test src/ir/producedSet.test.ts`.
- [x] T002 Locate and read the exact edit sites so later tasks touch the right code: `parseStoreItems` in `packages/engine/src/codec/parse.ts` (esp. the `isSmpLiteral` early-bail and the existing token-split/`splitTokens` path), `emitStoreItems` in `packages/engine/src/codec/emit.ts` (the `buf`/`flushBuf` string-collapse pass), the `OPAQUE_REASONS` const in `packages/engine/src/codec/opaque-reasons.ts`, and the existing codepoint helpers (`parseCodepoint`/`fmtCodepoint`/`unquote`). Record current line anchors for T004–T012.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The range-recognition scaffolding and the two new opaque-reason strings that all three stories build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Add two additive reason strings to `OPAQUE_REASONS` in `packages/engine/src/codec/opaque-reasons.ts`: `DESCENDING_RANGE = "descending-range"` and `MALFORMED_RANGE = "malformed-range"` (per [data-model.md](data-model.md) RawKmnFragment table). Additive-only — no existing reason changed, no `@keyboard-studio/contracts` type touched (Article I gate stays green).
- [x] T004 Add a private range-recognition + endpoint-decode helper to `packages/engine/src/codec/parse.ts` (used by US1/US2/US3): given the token stream from `splitTokens`, detect a range at a position as (a) a standalone `..` token flanked by decodable endpoints, (b) a single token with an embedded `..` (`U+0905..U+0910`), or (c) the split hybrids (`U+0905..`, `..U+0910`); decode each endpoint via `parseCodepoint` (`U+XXXX`) or `unquote` + single-codepoint check (quoted literal). Return `{ from, to }` codepoints or a classification of malformed. Do NOT wire expansion into `parseStoreItems` yet — that is per-story (T006/T009/T011). This is the shared recogniser only. (FR-002, FR-003; contract cases C2, C3.)

**Checkpoint**: Reason strings exist and the range recogniser is available to `parseStoreItems`. User stories can now proceed.

---

## Phase 3: User Story 1 — BMP range expands to its full codepoint set in the IR (Priority: P1) 🎯 MVP

**Goal**: A BMP range store (`U+0904 .. U+0914`) parses to its full inclusive codepoint set as `{kind:"char"}` items — no endpoints-only loss, no stray `{raw:".."}` item — and every `buildProducedSet` consumer inherits the corrected set unchanged.

**Independent Test**: Parse a `.kmn` whose only store is `U+0904 .. U+0914` referenced by a rule; assert 17 char items in order, zero `raw` items, and `buildProducedSet` returns those 17 glyphs.

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they FAIL before implementing T006.

- [x] T005 [P] [US1] Add parse tests in `packages/engine/src/codec/parse.test.ts` covering contract cases C1–C4: BMP range → 17 char items U+0904..U+0914 in order with no `{kind:"raw",text:".."}` item (FR-001/FR-012); mixed range+singletons `U+0591 .. U+05AF U+05BD .. U+05BF U+05C0 U+05C4` in source order (FR-004); U+ and single-char quoted endpoints mixed (`'अ' .. 'ऐ'`, `U+0905 .. 'ऐ'`) (FR-002); whitespace variants incl. no-space `U+0905..U+0910` (FR-003).
- [x] T006 [P] [US1] Add a produced-set test in `packages/contracts/src/ir/producedSet.test.ts`: a keyboard with `store(rng) U+0904 .. U+0914` referenced by `+ any(k) > index(rng,1)` yields all 17 codepoints from `buildProducedSet` — with NO change to `buildProducedSet` source (proves FR-011 inheritance; contract case C13).

### Implementation for User Story 1

- [x] T007 [US1] Wire the T004 recogniser into `parseStoreItems` in `packages/engine/src/codec/parse.ts` for BMP ranges: when a range is detected with `from <= to` (both BMP), push one `{kind:"char"}` per codepoint `from..to` inclusive (`from == to` → single item); non-range tokens continue through the existing per-token branches unchanged so singletons interleave freely (FR-001, FR-004). Ensure no well-formed range emits a `{kind:"raw",text:".."}` item (FR-012). Confirm T005 and T006 pass.

**Checkpoint**: BMP range stores expand correctly in the IR and produced-set consumers inherit the fix. MVP is independently functional and testable.

---

## Phase 4: User Story 2 — SMP range stores are no longer discarded (Priority: P1)

**Goal**: An astral range store (`U+11680 .. U+11689`) expands to its 10 SMP char items instead of being discarded to an `smp-literal` opaque fragment; the codec re-emits ranges compactly (`X .. Y`) so round-trip is semantic-stable; and the facet index recovers content-derived `casing`/`script`/`encoding` for range-store historic scripts.

**Independent Test**: Parse a `.kmn` whose alphabet store is `U+11680 .. U+11689` referenced by a rule; assert 10 astral char items, produced set contains them, store is NOT `opaque(smp-literal)`; run casing/script/encoding classifiers and assert real values.

### Tests for User Story 2 ⚠️

> Write these FIRST and confirm they FAIL before implementing T009/T010.

- [x] T008 [P] [US2] Add parse + emit + round-trip tests covering contract cases C5, C6, C10, C11, C12: SMP range → 10 astral char items, store NOT `opaque(smp-literal)` (FR-005) in `packages/engine/src/codec/parse.test.ts`; BMP↔SMP straddle `U+FFFE .. U+10001` → 4 char items across the boundary (Edge Cases) in `parse.test.ts`; standalone astral singleton `U+11680` stays `opaque(smp-literal)`, range logic not triggered (FR-010, C10) in `parse.test.ts`; emit re-collapse in `packages/engine/src/codec/emit.test.ts` — svara run → `U+0904 .. U+0914`, SMP run → quoted endpoints `'𑚀' .. '𑚉'`, ascending run length < 3 left uncollapsed (C11); semantic round-trip `parse(emit(parse(src)))` codepoint-set equality in `packages/engine/src/codec/roundtrip.test.ts` (C12/FR-008/SC-006).

### Implementation for User Story 2

- [x] T009 [US2] In `parseStoreItems` (`packages/engine/src/codec/parse.ts`), move the T004 range detection to run BEFORE the `isSmpLiteral` early-bail so an astral range expands into astral `{kind:"char"}` items instead of opaquing the whole store; the `char` value already holds a full (astral) codepoint string, so no new IR variant is needed. Leave the early-bail intact for non-range standalone astral singletons (C10 must still opaque). (FR-005, FR-010.) Confirm the SMP/straddle/C10 parts of T008 pass.
- [x] T010 [US2] Implement ascending-run re-collapse in `emitStoreItems` (`packages/engine/src/codec/emit.ts`): before the existing string-collapse pass, scan for maximal runs of `{kind:"char"}` items whose single codepoints ascend by exactly +1; collapse a run of length ≥ 3 to `fmtCodepoint(first) .. fmtCodepoint(last)` (SMP endpoints render as quoted literals per C11), leaving runs < 3 and all non-char items to the existing `buf`/`flushBuf` path unchanged (FR-008). Confirm the emit + round-trip parts of T008 pass.

**Checkpoint**: BMP and SMP ranges both expand, re-collapse compactly, and round-trip semantically. US1 and US2 are both independently functional.

---

## Phase 5: User Story 3 — Malformed and degenerate ranges fail safe (Priority: P2)

**Goal**: Descending, single-codepoint, and malformed ranges have defined behavior — never a wrong-direction interior, empty set, or crash. Single-cp is deliberately lenient (one item); descending and malformed preserve-opaque with a diagnostic reason.

**Independent Test**: Parse each degenerate form and assert the documented outcome: `U+0905 .. U+0905` → one item; `U+0910 .. U+0905` → `opaque(descending-range)`; missing/non-cp/multi-cp endpoint → `opaque(malformed-range)`.

### Tests for User Story 3 ⚠️

> Write these FIRST and confirm they FAIL before implementing T012.

- [x] T011 [P] [US3] Add degenerate-range parse tests in `packages/engine/src/codec/parse.test.ts` covering contract cases C7–C9: `U+0905 .. U+0905` → exactly one char item (lenient, C7 note); `U+0910 .. U+0905` → `opaque(descending-range)` with the store preserved and zero typed items (C8); `U+0905 ..`, `U+0905 .. foo`, `'ab' .. U+0910` → `opaque(malformed-range)` (C9). Assert no wrong-direction or empty expansion in any case.

### Implementation for User Story 3

- [x] T012 [US3] Complete the range classification in `parseStoreItems` (`packages/engine/src/codec/parse.ts`) using the T004 recogniser: `from == to` → one char item (lenient, already covered by T007's `from <= to`); `from > to` → abandon item accumulation and return the store as a `RawKmnFragment` with `opaqueReason: DESCENDING_RANGE`; undecodable/missing/multi-cp endpoint → return `RawKmnFragment` with `opaqueReason: MALFORMED_RANGE`. Never fabricate an interior or emit an empty expansion (FR-006). Confirm T011 passes.

**Checkpoint**: All three stories independently functional; the fail-safe path is defined and tested.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Corpus-scale verification and the spec 041 facet recovery that this fix unblocks.

- [x] T013 [P] Run the corpus round-trip over all 204 range-store lines in the sibling `../keyboards` checkout (parse → emit → re-parse): assert an identical codepoint set per line and zero `{kind:"raw",text:".."}` items across the full corpus parse ([quickstart.md](quickstart.md) Scenario H; SC-003, SC-006).
- [x] T014 Rebuild the facet index `--classified-only` and run `pnpm run facet-index-lint` ([quickstart.md](quickstart.md) Scenario I): confirm the `encoding` `undetermined` count drops from 46 and `casing` from 15 by the range-store-attributable amount (e.g. `takri_inscript` now content-derived), no previously-classified keyboard regresses to `undetermined`, two consecutive builds are byte-identical, and the lint stays green (SC-002, SC-004).
- [x] T015 Run the full downstream suites green ([quickstart.md](quickstart.md) Scenario G): `pnpm --filter @keyboard-studio/engine test`, `pnpm --filter @keyboard-studio/contracts test`, `pnpm --filter @keymanapp/keyboard-lint test` — criteria/count guards and existing round-trip vectors unaffected (SC-005).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational (T003, T004).
  - US1 (P1) is the MVP; US2 (P1) extends US1's expansion path (T009 depends on T007's wiring) and owns emit round-trip; US3 (P2) completes the classification T007 began.
- **Polish (Phase 6)**: Depends on US1+US2 (T013 needs emit re-collapse T010; T014 needs SMP expansion T009). T015 depends on all stories.

### User Story Dependencies

- **US1 (P1)**: Independently testable via parse + produced-set (no emit needed).
- **US2 (P1)**: Builds on US1's `parseStoreItems` wiring (T007) and adds the SMP path + emit re-collapse; independently testable via SMP parse + emit + round-trip.
- **US3 (P2)**: Extends the same `parseStoreItems` classification; independently testable via degenerate-form parses.

> Note: US1, US2, and US3 all edit the same two files (`parse.ts`, `emit.ts`). They are *independently testable* but not *file-parallel* against each other — sequence the implementation tasks (T007 → T009/T012, T010) even though their tests were written in parallel.

### Within Each User Story

- Tests (T005/T006, T008, T011) written and FAILING before implementation.
- Parse wiring before emit; classification hardening (US3) after the happy-path wiring (US1).

### Parallel Opportunities

- **Setup**: T001 → T002 sequential (T002 reads what T001 built).
- **Foundational**: T003 [P] and T004 [P] touch different files (opaque-reasons.ts vs parse.ts) — parallel.
- **Tests within/across stories**: T005 [P] (parse.test.ts) and T006 [P] (producedSet.test.ts) are different files — parallel. T008 spans parse/emit/roundtrip test files. T011 [P] (parse.test.ts). All test-authoring can front-run implementation.
- **Polish**: T013 [P] (corpus harness) parallel with early T014 prep; T015 after all impl.

---

## Parallel Example: Foundational + US1 tests

```bash
# Foundational — different files, run together:
Task: "T003 add DESCENDING_RANGE/MALFORMED_RANGE to opaque-reasons.ts"
Task: "T004 add range recogniser helper to parse.ts"

# US1 tests — different files, run together (author before T007):
Task: "T005 BMP/mixed/quoted/whitespace parse tests in parse.test.ts"
Task: "T006 produced-set inheritance test in producedSet.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → green baseline.
2. Phase 2 Foundational (reason strings + recogniser) — CRITICAL, blocks all stories.
3. Phase 3 US1 — BMP expansion + produced-set inheritance.
4. **STOP and VALIDATE**: BMP range stores expand in the IR; `buildProducedSet` returns full interiors. This alone repairs the BMP range-store keyboards and removes the `{raw:".."}` artifact class.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → BMP correctness (MVP).
3. US2 → SMP recovery + compact emit/round-trip (carries most of the corpus value — the historic-script keyboards).
4. US3 → malformed/degenerate fail-safe hardening.
5. Polish → corpus round-trip (SC-006), facet recovery (SC-002/SC-004), full suites green (SC-005).

### Notes

- No `@keyboard-studio/contracts` change anywhere — IR option A reuses `{kind:"char"}`; the only enum growth is two additive `OPAQUE_REASONS` strings (Article I gate stays green).
- The bar is **semantic** round-trip (same codepoint set); byte-identical is out of scope (FR-008, Article VII).
- Commit under `feat(engine):`; the feature rides the open spec 041 branch / PR #1190 per owner instruction — no separate feature branch.
