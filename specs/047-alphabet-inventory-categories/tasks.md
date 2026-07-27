---
description: "Task list for Richer character-inventory breakdown on 'Add your whole alphabet'"
---

# Tasks: Richer character-inventory breakdown on "Add your whole alphabet"

**Input**: Design documents from `/specs/047-alphabet-inventory-categories/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ui-contract.md

**Tests**: Test tasks ARE included — the feature scopes them explicitly (plan.md lists `glyphCategory.test.ts`, `phaseBDraftStore.test.ts`, `BuildListView.test.tsx`; SC-007 requires the code-point label "verified in test"). Follow test-first within each story.

**Organization**: Tasks are grouped by user story (US1–US4) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths are included in every task

## Path Conventions

Monorepo: engine primitive under `packages/engine/src/`, all UI under `packages/studio/src/`. Paths below are repo-relative and match plan.md's Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No project-initialization work is needed — the monorepo, both packages, test runners, and lint are already in place. This phase only stakes out the new module files the later phases fill in, so parallel work does not collide on file creation.

- [x] T001 [P] Create empty engine module `packages/engine/src/character-discovery/glyphCategory.ts` (sibling of `decompose.ts`) with a placeholder `export type GlyphCategory` and `export function glyphCategory` stub to be filled in T004.
- [x] T002 [P] Create empty studio helper stubs: `packages/studio/src/survey/charNormUtils.ts`, `packages/studio/src/survey/codepointLabel.ts`, and `packages/studio/src/survey/collation.ts` (stub exports only) to be filled in the Foundational + story phases.

**Checkpoint**: New module files exist and compile as empty stubs; no behavior changed yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure, dependency-free primitives every user story builds on. These are independently unit-testable and must land before US1/US2 wiring.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Write classification vectors for the General-Category primitive in `packages/engine/src/character-discovery/glyphCategory.test.ts` — assert exactly one of `letter | number | punctuation | symbol | separator | control` for representative chars ("a", "1", ".", "€", NBSP U+00A0, U+200B ZWSP, a control char); assert each returns exactly one value (mutually exclusive) over that non-mark domain; and assert the **defensive fallback** — a bare combining mark (e.g. U+0301) returns `control`, never `undefined` — since `\p{L|N|P|S|Z|C}` is not total over Unicode (data-model GlyphCategory, FR-004/FR-005). Ensure the test FAILS first.
- [x] T004 Implement pure `glyphCategory(char): GlyphCategory` in `packages/engine/src/character-discovery/glyphCategory.ts` using native `\p{L}`/`\p{N}`/`\p{P}`/`\p{S}`/`\p{Z}`/`\p{C}` escapes in that precedence (research Decision 3); marks `\p{M}` and PUA are the caller's concern, but an unmatched input (incl. a bare `\p{M}` char that reaches the function) MUST fall to `control` so the function is total and never returns `undefined` (data-model defensive-fallback note). Makes T003 pass.
- [x] T005 Export `glyphCategory` and `type GlyphCategory` from `packages/engine/src/index.ts` next to `decomposeGrapheme` / `isCombiningMarkChar` (plan.md).
- [x] T006 [P] Write code-point label vectors in `packages/studio/src/survey/codepointLabel.test.ts` — single code point → `{ label: "U+0061", title: "U+0061" }`; multi-code-point grapheme `Ə́` (U+018F U+0301) → `{ label: "U+018F+", title: "U+018F U+0301" }` (FR-014, SC-007, data-model CodepointLabel). Ensure it FAILS first.
- [x] T007 [P] Implement studio-local `codepointLabel(grapheme): { label; title }` in `packages/studio/src/survey/codepointLabel.ts` (research Decision 6). Leaves the contract util `toUPlusNotation` untouched (FR-012). Makes T006 pass.
- [x] T008 [P] Implement the shared default-ICU comparator in `packages/studio/src/survey/collation.ts` — a single `Intl.Collator(undefined, { usage: "sort" })` compare fn used to order breakdown sections (FR-007, research Decision 4); no locale/tailoring.

**Checkpoint**: Engine GC classifier and studio label/collation helpers exist, are exported, and are unit-tested. User stories can now proceed.

---

## Phase 3: User Story 1 - Paste a whole text and get a complete inventory (Priority: P1) 🎯 MVP

**Goal**: The "Type your alphabet" box captures every distinct grapheme typed or pasted (not just the first grapheme of each token), dropping only the five ordinary whitespace chars and logging anything else unusual.

**Independent Test**: Paste "Naïve? Yes — 3 times."; confirm every distinct non-whitespace character is captured into the inventory (not just word-initial letters), and CR/LF/CRLF/Tab/space are dropped.

### Tests for User Story 1 (write first, ensure they FAIL)

- [x] T009 [P] [US1] Unit-test `harvestChars(raw)` in `packages/studio/src/survey/charNormUtils.test.ts` — whole-string grapheme capture with no spaces (AS1.2), drop-only-the-five-whitespace skip-set keeping NBSP and other invisibles (AS1.3, FR-002, SC-006), returns `{ chars, unusual }` with unusual separators/format/control chars listed (FR-003), NFC-normalized + deduped. Ensure FAILS first.
- [x] T010 [P] [US1] Add capture cases to `packages/studio/src/survey/BuildListView.test.tsx` — paste "Naïve? Yes — 3 times." captures all distinct characters into the alphabet (AS1.1, SC-001); typing with no spaces captures each char (AS1.2); whitespace-only paste adds nothing (edge case). Ensure FAILS first.

### Implementation for User Story 1

- [x] T011 [US1] Implement pure `harvestChars(raw): { chars: string[]; unusual: string[] }` in `packages/studio/src/survey/charNormUtils.ts` — grapheme-split via `Intl.Segmenter` (as `PhaseB.getFirstGrapheme` already does), drop only CR/LF/CRLF/Tab/U+0020, keep everything else, collect unusual separator/format/control chars, NFC-normalize + dedup via existing `nfcDedup` (research Decision 1). Makes T009 pass.
- [x] T012 [US1] Rewire `CharChipEditor.add()` in `packages/studio/src/survey/PhaseB.tsx` to call `harvestChars()` over the whole input instead of `getFirstGrapheme` per token, capturing every character; log the returned `unusual` list so unusual invisibles are discoverable (FR-001/FR-003). Makes T010 pass.
- [x] T013 [US1] Wire `codepointLabel()` into the `CharChipEditor` chip's `chipCodepoint` span in `packages/studio/src/survey/PhaseB.tsx` — visible `label` + hover/`title`/accessible name = full stack (FR-014 for the "Your alphabet" chips).

**Checkpoint**: Whole-text capture works end-to-end; every distinct non-whitespace character is captured and unusual chars are logged. US1 is independently testable (MVP).

---

## Phase 4: User Story 2 - See the inventory split into meaningful categories (Priority: P1)

**Goal**: The breakdown panel shows Numbers, Punctuation, Symbols, Separators, and Control/other sections beneath Accented letters; each captured character lands in exactly one section, empty sections are hidden, and members are ICU-ordered.

**Independent Test**: Alphabet "a", "1", ".", "€" → "a" under Letters, "1" under Numbers, "." under Punctuation, "€" under Symbols, each once; empty categories hidden; letters dictionary-ordered.

### Tests for User Story 2 (write first, ensure they FAIL)

- [x] T014 [P] [US2] Extend `packages/studio/src/stores/phaseBDraftStore.test.ts` — `deriveStores()` routes "1"→`numbers`, "."→`punctuation`, "€"→`symbols`, NBSP→`separators`, surviving control→`controls`; no double-count (FR-005/SC-002); marks and PUA-declared-letter keep their existing paths (edge cases); `chars`/`confirmedInventory` still contain the COMPLETE inventory across all categories (FR-013, data-model invariants); removing a pick recomputes every array with no orphans. Ensure FAILS first.
- [x] T015 [P] [US2] Extend `packages/studio/src/survey/BuildListView.test.tsx` — the five new sections render beneath `alphabet-accented` with the contract `data-testid`s and `(n)` counts (FR-004, ui-contract); empty sections do not render (FR-006/AS2.2); Letters members are default-ICU-ordered so accented letters sit adjacent to their base (FR-007/AS2.3/SC-003). Ensure FAILS first.
- [x] T016 [US2] **Blocking gate (run before T017).** Resolve the research Decision 2 risk: `bases` currently carries non-letters via the catch-all `pushBase`, so restricting it to `\p{L}` (T017) could regress a downstream consumer. Grep every reader of the three-store `bases` and add a test asserting none relies on `bases` containing digits/punctuation/symbols. Record the finding: **(a) no consumer depends on it** → proceed to T017 as written; **(b) a consumer does** → T017 keeps `bases` complete and the Letters *view* filters to `\p{L}` instead (view-only variant), and T016a below is activated. Do NOT start T017 until this gate has a recorded outcome.
- [x] T016a [US2] **Conditional on T016 outcome (b) only** — if a downstream consumer relies on non-letter `bases`, implement the view-only Letters filter in `AlphabetBreakdown` (`packages/studio/src/survey/PhaseB.tsx`) rather than restricting the store's `bases`, and add a regression test that the depended-on consumer still sees the complete `bases` (FR-013). If T016 outcome is (a), this task is a no-op — mark it N/A with a one-line note.

### Implementation for User Story 2

- [x] T017 [US2] **After the T016 gate.** In `packages/studio/src/stores/phaseBDraftStore.ts` `deriveStores()`, add derived arrays `numbers`/`punctuation`/`symbols`/`separators`/`controls` to `PhaseBDraftState` and route each non-letter, non-mark, non-PUA pick to its array via `glyphCategory()` (marks→Marks, PUA→declared role handled ahead of GC); **on T016 outcome (a)** restrict the Letters `bases` to `\p{L}`; **on outcome (b)** leave `bases` complete and defer the `\p{L}` filter to the view (see T016a). Keep flat `chars` complete either way (research Decision 2, data-model). Makes T014 pass.
- [x] T018 [US2] In `AlphabetBreakdown` within `packages/studio/src/survey/PhaseB.tsx`, render the five new sections beneath `alphabet-accented` with `data-testid`s `alphabet-numbers`/`-punctuation`/`-symbols`/`-separators`/`-controls`, each only when non-empty, with `(n)` counts (FR-004/FR-006, ui-contract). Makes the section part of T015 pass.
- [x] T019 [US2] Order every breakdown section's displayed members with the shared `collation.ts` comparator (sort the view array only; leave stored `chars`/picks in first-appearance order) (FR-007, research Decision 4). Completes T015 ordering.
- [x] T020 [US2] Wire `codepointLabel()` into the `AlphabetBreakdown` chip labels (breakdown-side of FR-014) in `packages/studio/src/survey/PhaseB.tsx`.

**Checkpoint**: US1 + US2 together = the MVP — a complete captured inventory split into legible, ICU-ordered, mutually-exclusive category sections.

---

## Phase 5: User Story 3 - Review letters by lowercase, with uppercase on demand (Priority: P2)

**Goal**: The Letters section shows only the lowercase (or caseless) of each case pair by default, with a "Show uppercase letters" toggle that additionally reveals derived uppercases (display-only); on Done the recorded alphabet gains each cased letter's locale-correct uppercase counterpart.

**Independent Test**: Enter "a b c" → Letters shows a/b/c; toggle on → A/B/C also appear; finish the step → recorded alphabet contains both cases.

### Tests for User Story 3 (write first, ensure they FAIL)

- [x] T021 [P] [US3] Extend `packages/studio/src/survey/BuildListView.test.tsx` — Letters section case-collapses to lowercase with toggle off (AS3.1); `letters-uppercase-toggle` on reveals derived uppercases (AS3.2/FR-008); caseless-script letter or letter with a null counterpart is shown as entered, not folded (AS3.4/FR-010); an **uppercase-only** entry (author enters "A" with no "a") is shown as the entered uppercase and NOT replaced by a synthesized lowercase (FR-010 edge case, data-model display-unit note). Ensure FAILS first.
- [x] T022 [P] [US3] Add a record-both-cases test in `packages/studio/src/survey/BuildListView.test.tsx` (or the store test) — on Done, `confirmedInventory` contains lowercase + derived uppercase counterparts, deduped, respecting locale casing (Turkish dotted/dotless i); null counterparts contribute nothing (AS3.3/FR-009/FR-010/SC-004, data-model). Ensure FAILS first.

### Implementation for User Story 3

- [x] T023 [US3] In `AlphabetBreakdown` (Letters section) in `packages/studio/src/survey/PhaseB.tsx`, derive one display unit per lowercase/caseless letter via engine `caseCounterpart(letter, bcp47)`; add local `showUppercase` state (default false) and the `letters-uppercase-toggle` control labelled "Show uppercase letters" that additionally renders derived uppercase chips (display-only) (FR-008, ui-contract, research Decision 5). Makes T021 pass.
- [x] T024 [US3] In the Phase B "Done"/`onComplete` path in `packages/studio/src/survey/PhaseB.tsx`, augment the recorded alphabet with each cased letter's `caseCounterpart` counterpart before completion, deduped; null counterparts add nothing (FR-009/FR-010, data-model). Makes T022 pass.

**Checkpoint**: US1–US3 functional; Letters section is uncluttered and both cases are recorded correctly.

---

## Phase 6: User Story 4 - Keep the "Your alphabet" list focused on letters (Priority: P2)

**Goal**: The "Your alphabet" chip list shows only letters, diacritics (marks), and letter+mark combos — never numbers/punctuation/symbols/separators/controls, which remain in their own category sections.

**Independent Test**: Paste text with letters, a digit, and punctuation → "Your alphabet" shows only letters/diacritics/combos; the digit and punctuation appear only in their category sections.

### Tests for User Story 4 (write first, ensure they FAIL)

- [x] T025 [P] [US4] Extend `packages/studio/src/survey/BuildListView.test.tsx` — with alphabet "a", "é", a combining accent, "5", "?", the "Your alphabet" list shows a/é/diacritic/combo but not "5"/"?" (AS4.1/FR-011/SC-005); the filtered `(n)` count reflects only linguistic content (ui-contract); "5" still appears under Numbers and "?" under Punctuation (AS4.2). Ensure FAILS first.

### Implementation for User Story 4

- [x] T026 [US4] Filter the `CharChipEditor` "Your alphabet" chip list in `packages/studio/src/survey/PhaseB.tsx` to letters, marks, and letter+mark combinations only (exclude numbers/punctuation/symbols/separators/controls via `glyphCategory`), and make the `survey.phaseB.charChipEditor.count` heading reflect the filtered count (FR-011, ui-contract). Non-letters stay visible in their breakdown sections. Makes T025 pass.

**Checkpoint**: All four user stories independently functional and testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification, regression, and doc touch-ups spanning the stories.

- [x] T027 [P] Verify FR-012 unchanged — add/confirm a test that the character picker's Unicode-value ordering is not affected by this feature (`packages/studio/src/survey/BuildListView.test.tsx` or the picker's own test).
- [x] T028 [P] Run the full gate locally and fix any fallout: `pnpm --filter @keyboard-studio/engine test`, `pnpm --filter @keyboard-studio/studio test`, `pnpm typecheck`, `pnpm lint` (the `i18n-catalog-lint` step in `pnpm lint` is the guard that no existing i18n message-id was renamed — a rename orphans translations per house conventions).
- [x] T029 Conditional — only if this feature added or cited a keyboard/fixture (this feature adds none): add its row to [docs/keyboard-index.md](docs/keyboard-index.md) per the phonebook recipe. If nothing was added, mark N/A with a one-line note; the i18n-rename check now lives in T028.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (glyphCategory, codepointLabel, collation).
- **User Stories (Phase 3–6)**: All depend on Foundational completion.
  - US1 and US2 are both P1 and form the MVP; US2's store routing depends on the engine `glyphCategory` from Phase 2.
  - US3 and US4 (P2) build on the Letters/breakdown UI from US1+US2.
- **Polish (Phase 7)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. Independent — capture path.
- **US2 (P1)**: After Foundational (needs `glyphCategory`). Shares `PhaseB.tsx`/store with US1 but independently testable; sequence US1 → US2 to avoid `PhaseB.tsx` merge churn. **Internal gate**: T016 (downstream-`bases` resolution) blocks T017 — the store-vs-view placement of the `\p{L}` restriction is decided by its outcome; T016a fires only on outcome (b).
- **US3 (P2)**: After US2 (extends the Letters section it renders).
- **US4 (P2)**: After US1 (filters the chip list US1 populates) and depends on `glyphCategory`.

### Within Each User Story

- Tests written first and FAIL before implementation.
- Pure helpers/store derivation before UI wiring.
- Story complete and independently testable before moving to the next priority.

### Parallel Opportunities

- Setup T001/T002 run in parallel (different files).
- Foundational: T003+T006+T008 (tests/helper) parallel; T004→T005 sequential (impl then export); T007 after/with T006.
- Within a story, the [P] test tasks run in parallel; implementation tasks that touch the same `PhaseB.tsx` are sequential.
- **Cross-story caution**: US1, US2, US3, US4 all edit `packages/studio/src/survey/PhaseB.tsx` — do NOT parallelize their implementation tasks across developers on that one file; run the stories in priority order.

---

## Parallel Example: Foundational Phase

```bash
# Launch the independent primitive tests/helpers together:
Task: "Classification vectors in packages/engine/src/character-discovery/glyphCategory.test.ts"   # T003
Task: "Code-point label vectors in packages/studio/src/survey/codepointLabel.test.ts"             # T006
Task: "Default-ICU comparator in packages/studio/src/survey/collation.ts"                         # T008
```

## Parallel Example: User Story 2 tests

```bash
Task: "Store category-routing tests in packages/studio/src/stores/phaseBDraftStore.test.ts"  # T014
Task: "Breakdown-section render tests in packages/studio/src/survey/BuildListView.test.tsx"  # T015
# T016 is NOT parallel — it is a blocking gate that must resolve before T017.
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — glyphCategory, codepointLabel, collation).
2. Complete Phase 3 (US1 capture) → validate whole-text capture independently.
3. Complete Phase 4 (US2 categories) → validate the six mutually-exclusive, ICU-ordered sections.
4. **STOP and VALIDATE**: US1+US2 are both P1 and together deliver the core request — this is the shippable MVP.

### Incremental Delivery

1. Setup + Foundational → primitives ready.
2. US1 → whole-text capture (test/demo).
3. US2 → category breakdown (test/demo) — **MVP**.
4. US3 → case-collapse toggle + record-both-cases (test/demo).
5. US4 → focused "Your alphabet" list (test/demo).

Each story adds value without breaking the previous.

---

## Notes

- [P] = different files, no incomplete-task dependency. `PhaseB.tsx` is shared by US1–US4 implementation tasks — those are NOT [P] relative to each other.
- No contract/schema edit anywhere (Constitution Article I); the confirmed-alphabet stays additive (FR-013).
- No console emoji; i18n ids follow `area.segment`; commit/PR titles use `feat(studio)` / `feat(engine)` per house conventions.
- Verify each story's tests fail before implementing; commit after each task or logical group.
