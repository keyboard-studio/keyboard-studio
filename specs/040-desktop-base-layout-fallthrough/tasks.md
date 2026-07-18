---
description: "Task list — Spec 040: Desktop base-layout fall-through in the script facet"
---

# Tasks: Desktop base-layout fall-through in the script facet

**Input**: Design documents from `specs/040-desktop-base-layout-fallthrough/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories),
[research.md](research.md), [data-model.md](data-model.md),
[contracts/base-layout-fallthrough.contract.md](contracts/base-layout-fallthrough.contract.md)

**Tests**: Included. The spec's User Stories each define an explicit *Independent Test* and the
contract lists testable invariants; this feature is a deterministic classifier change whose whole
value is behavioral correctness, so vitest tasks are first-class (mirrors the 037 classifier test
convention).

**Organization**: Grouped by user story (US1 P1 → US2 P2 → US3 P3) so each ships as an independently
testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup/foundational/polish carry no story label)
- All paths are repo-root-relative.

## Scope guardrails (from plan + constitution)

- All logic lives in the tool-owned `utilities/facet-index/`. **Do NOT** touch
  `packages/contracts/src/ir/producedSet.ts`, the KeyboardIR, or the codec (FR-011, Constitution II).
- `classifyScript(ir, def)` signature stays pinned — no widening to `ParseResult`.
- Leaked evidence is **distribution-only**; dominant `value` + `confidenceClass` stay rule-derived.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Land the pinned data file that every later phase reads.

- [X] T001 [P] Create the pinned base-layout table at `utilities/facet-index/data/base-layouts.json`
  with the single `kbdus` family: unshifted `K_A`…`K_Z` → lowercase Latin char map (`"K_A":"a"` …
  `"K_Z":"z"`), sourced from Keyman's `kbdus` base layout. Every value one BMP codepoint; no
  control/DEL/space. (FR-008, contract §1, data-model Entity 1)
- [X] T002 [P] Add a `data/SOURCES.json` entry (or extend it) documenting the `base-layouts.json`
  provenance/pin — source = Keyman `kbdus`, so the manifest `referencePins` step (T017) has a stable
  hash target alongside the existing UCD pins.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The base-layout resolution + leaked-key detection module that all three user stories
consume. Nothing in US1/US2/US3 can be written before this exists.

**⚠️ CRITICAL**: US1–US3 all depend on `base-layout.ts`.

- [X] T003 Create `utilities/facet-index/base-layout.ts` exporting:
  (a) a loader that reads and validates `data/base-layouts.json` into
  `Map<family, Map<vkey, char>>` (fails loud on a non-BMP/control value);
  (b) `DEFAULT_BASELAYOUT = "kbdus"`;
  (c) `resolveBaseLayout(ir): { family, charByVkey, branchesOn }` — `family` always `kbdus`,
  `charByVkey` from the table, `branchesOn` = distinct non-empty `{ kind:"baselayout"; value }`
  context values (normalized lowercase) walked from `ir.groups[*].rules[*].context`.
  (data-model Entities 2 & 3, research Q1/Q-extra, FR-005/FR-006)
- [X] T004 In `utilities/facet-index/base-layout.ts` add `namedBaseLayerVkeys(ir): Set<string>` — the
  set of vkeys named by **any** base-layer rule context, where "base-layer" = a
  `{ kind:"vkey"; name }` element whose modifiers are empty or `NCAPS`-only (re-express the engine's
  `isBaseLayer` predicate locally; the tool cannot import `packages/engine/src/placement/filters.ts`).
  Also export `hasBaseLayerRuleSurface(ir): boolean` = **`namedBaseLayerVkeys(ir).size > 0`** (the IR
  carries at least one base-layer physical-key rule) — the explicit desktop-vs-touch-only signal the
  classifier's no-op guard keys on (T012); `leakedChars` emptiness alone cannot express it, because a
  touch-only IR names no base-layer vkey and therefore leaks the *full* alphabet.
  Then `leakedChars(ir): string[]` = for each `K_A`…`K_Z` in the resolved table **not** in that set,
  the table's char (covers un-blocked; remaps/`> nul`/guarded/group-routed all count as named → no
  leak). (FR-001/FR-002/FR-010, research Q2, contract §2.1)
- [X] T005 [P] Create `utilities/facet-index/base-layout.test.ts` covering resolution +
  detection in isolation (no classifier): default family is `kbdus`; `branchesOn` collects
  `baselayout('...')` guard values; a named/remapped vkey and a `> nul` vkey are both excluded from
  `leakedChars`; an un-named vkey is included. Assert the touch-only semantics precisely at the pure
  helper level: a touch-only IR (no base-layer vkey rules) has `hasBaseLayerRuleSurface(ir) === false`
  **and** `leakedChars(ir)` returns the full `K_A`…`K_Z` alphabet — the suppression of that leak is a
  classifier-layer concern (T012 gates on `hasBaseLayerRuleSurface`), so this file asserts only the
  pure helper contract, not the suppressed classifier outcome.

**Checkpoint**: `base-layout.ts` resolves leak sets deterministically and is unit-tested; the
classifier can now consume it.

---

## Phase 3: User Story 1 - Un-blocked base-layout key surfaces as a script sliver (Priority: P1) 🎯 MVP

**Goal**: Fold leaked (un-blocked) base-layout chars into the `script` classifier so a non-Latin
desktop keyboard's real Latin sliver shows as a minor `distribution` entry, dominant stays non-Latin.

**Independent Test**: Classify a fixture non-Latin desktop keyboard that leaves `K_A` un-named →
the `script` categorization has a minor `Latn` entry, `evidenceSize` reflects the leaked char(s),
`provenanceTier` stays `content-derived`, dominant stays the non-Latin script.

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they FAIL before T012.

- [X] T006 [P] [US1] Add a fixture non-Latin desktop keyboard leaving `K_A` un-named under
  `utilities/facet-index/__fixtures__/` (reuse the 037 fixture conventions; a small `.kmn` or IR
  builder as the existing script fixtures do).
- [X] T007 [P] [US1] In `utilities/facet-index/script-classifier.test.ts` add cases (contract §2
  invariants): un-blocked `K_A` yields a minor `Latn` distribution entry with dominant unchanged
  (AS1); `notes` carries `base-layout: kbdus (default)` and appends `; branches-on: <value>` when a
  guard is present (AS2); a keyboard already remapping `K_A` to a non-Latin char adds **no** leaked
  Latin for `K_A` (AS3). (SC-001)

### Implementation for User Story 1

- [X] T008 [US1] In `utilities/facet-index/script-classifier.ts` compute the rule-produced histogram
  exactly as today (from `buildProducedSet`), keep it as the **dominant/confidence source of truth**,
  then call `resolveBaseLayout(ir)` + `leakedChars(ir)` from `base-layout.ts`. (FR-001)
- [X] T009 [US1] Map each leaked char to its ISO-15924 script via the same pinned UCD lookup the
  classifier already uses and **add** it to the `distribution` histogram; increase `evidenceSize` by
  the leaked count. Dominant `value` is still selected from the rule-produced histogram only.
  (FR-003, data-model Entity 4, contract §2.2)
- [X] T010 [US1] Write the `notes` string: `base-layout: kbdus (default)`, appending
  `; branches-on: <comma-joined sorted branchesOn>` when non-empty; keep `provenanceTier:
  "content-derived"`. (FR-006/FR-007, contract §2.4/§2.5)

**Checkpoint**: A non-Latin desktop keyboard with an un-blocked key surfaces the leaked sliver;
US1 tests pass. MVP is demonstrable.

---

## Phase 4: User Story 2 - Suppressed keys stay silent and the leak never dominates (Priority: P2)

**Goal**: Prove the safety guarantees — `> nul` blocks leak nothing, and folding leaked evidence
never flips the dominant value or worsens the confidence class.

**Independent Test**: (a) a keyboard blocking every base-layout key with `> nul` → zero leaked
evidence, byte-identical to pre-feature baseline; (b) a mostly-passthrough non-Latin keyboard → same
dominant `value` and `confidenceClass` with and without the leak folded in.

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] In `utilities/facet-index/script-classifier.test.ts` add: (a) an all-`> nul`
  keyboard produces zero leaked evidence and matches its pre-feature record (SC-003, AS1); (b) a
  mostly-passthrough non-Latin keyboard has identical dominant `value` + `confidenceClass` with the
  leak on (compare against the rule-only computation) (SC-002, AS2/AS3).

### Implementation for User Story 2

- [X] T012 [US2] In `script-classifier.ts` guard the fold so it is a **no-op when
  `hasBaseLayerRuleSurface(ir) === false`** (touch-only IR — the explicit T004 predicate, **not**
  `leakedChars` emptiness, which is the full alphabet for a touch-only IR) **or** when `leakedChars`
  is empty (fully-remapped/all-`> nul`) — return the pre-feature `Categorization` unchanged (edge
  case: touch-only; feeds SC-004/FR-010). Blocked keys (all named) already yield empty `leakedChars`
  from T004; a touch-only IR is caught by the surface guard *before* `leakedChars` is consulted.
  (FR-002/FR-010)
- [X] T013 [US2] Assert the invariant in code structure: dominant `value` and `confidenceClass` are
  computed **before** the distribution fold and never re-derived from the post-fold histogram
  (defensive ordering so a future edit cannot accidentally let the sliver vote). (FR-004, contract §2.3)

**Checkpoint**: Suppression + no-flip/no-confidence-loss guarantees hold and are tested; US1 still
passes.

---

## Phase 5: User Story 3 - Deterministic, versioned regeneration of the committed index (Priority: P3)

**Goal**: Version the change and regenerate the committed artifact reproducibly, with the new pinned
table recorded for freshness.

**Independent Test**: Bump the classifier/schema version, regenerate the index twice from identical
pinned inputs, confirm byte-identical output; confirm `base-layouts.json` appears in the manifest
`referencePins`; confirm the artifact passes `facet-index-lint`.

### Tests for User Story 3 ⚠️

- [X] T014 [P] [US3] Add/extend a determinism assertion in
  `utilities/facet-index/determinism.test.ts` (or `script-classifier.test.ts`): identical
  `(IR, base-layouts.json)` inputs → byte-identical `Categorization`, no environment reads. (SC-005,
  AS2)

### Implementation for User Story 3

- [X] T015 [US3] Bump `content/keyboard-facets/script.yaml` `schemaVersion 1 → 2` and add a
  `description`/note documenting desktop base-layout fall-through as the reason for the bump.
  (FR-009, contract §3)
- [X] T016 [US3] Force the recompute at its **actual** trigger: bump the `script@N` token in
  `CLASSIFIER_VERSION` in `utilities/facet-index/freshness.ts`. **Baseline check first** — at HEAD this
  token is already `script@2` (a prior classifier change bumped it), so 040 bumps it `script@2 →
  script@3` (confirm the current committed value before editing; do not assume `@1`). That token
  composes into `scannerVersion`, and a `scannerVersion` change is the gate that invalidates every
  content-derived record (`freshness.ts` `planRescan`/version-mismatch path). The `script.yaml`
  `schemaVersion` bump (T015) is the facet-def marker documenting *why*; it does **not** by itself
  drive the freshness rescan — `CLASSIFIER_VERSION` does. Verify `DEFAULT_CLASSIFIERS` still wires
  `script-classifier` as a `{ classify, fallback }` pair. (FR-009, research "Determinism & freshness
  impact")
- [X] T017 [US3] Record `data/base-layouts.json` in the index manifest `referencePins` (alongside the
  UCD pins) with its sha256, so freshness auditing pins the leak-source table. (FR-008, contract §3,
  data-model Entity 1)
- [X] T018 [US3] Regenerate `docs/keyboard-facet-index.json` in full via the `--classified-only`
  build and re-lint with `pnpm run facet-index-lint`; commit the regenerated artifact + `.md`
  companion. Confirm a second regeneration is byte-identical. (FR-009, SC-005, AS1/AS3)

**Checkpoint**: The committed index is regenerated deterministically, versioned, pinned, and lints
clean.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Run the full facet-index vitest suite (`pnpm --filter @keyboard-studio/... ` n/a —
  the tool runs under its own vitest config: `cd utilities/facet-index && npx vitest run`) and
  `pnpm run facet-index-lint` + `pnpm run facet-lint`; confirm green.
- [X] T020 [P] Update `utilities/facet-index/README.md` and add a one-line note to `CLAUDE.md`'s
  facet-index architecture bullet: the `script` classifier now folds desktop base-layout fall-through
  (distribution-only) — spec 040. (House-convention docs sync)
- [X] T021 Verify SC-004 explicitly: pick 2–3 touch-only keyboards from the corpus and confirm their
  regenerated `script` records are byte-identical to the pre-040 baseline (diff the artifact for
  touch-only rows). (FR-010, SC-004)
- [X] T022 [P] Reconcile the spec's original `&baselayout`-store assumption per research's "Flag for
  the spec author": leave `spec.md` §7 FR-007 governing text consistent with the environment-default
  reality (a `refs`-level doc follow-up, not a code change).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001/T002 — no dependencies, start immediately.
- **Foundational (Phase 2)**: depends on T001 (loader reads the table). **Blocks all user stories.**
- **US1 (Phase 3)**: depends on Phase 2 (`base-layout.ts`). MVP.
- **US2 (Phase 4)**: depends on Phase 2; builds on the US1 fold (T012/T013 harden the same
  `script-classifier.ts` fold). Independently testable via its own fixtures.
- **US3 (Phase 5)**: depends on the classifier logic being final (US1+US2) before the version bump +
  recompute (T018 regenerates against final behavior).
- **Polish (Phase 6)**: depends on all desired user stories complete.

### Within Each User Story

- Tests (T006/T007, T011, T014) written and FAILING before the matching implementation.
- Module (`base-layout.ts`) before classifier consumption.
- Classifier fold before the version bump + recompute.

### Parallel Opportunities

- T001 ‖ T002 (setup, different files).
- T005 runs alongside T003/T004 authoring once the module surface is agreed (same file — coordinate;
  mark test-writing parallel to fixture work, not to the same-file impl).
- T006 ‖ T007 (fixture vs test file).
- T019 ‖ T020 ‖ T022 (suite run, docs, spec reconciliation — different files).

---

## Parallel Example: User Story 1

```bash
# Author the failing tests + fixture together (different files):
Task: "T006 [US1] Add un-blocked-K_A fixture in utilities/facet-index/__fixtures__/"
Task: "T007 [US1] Add script-classifier.test.ts leak cases"
# Then implement the fold sequentially in script-classifier.ts (T008 → T009 → T010, same file).
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup (T001/T002) → Phase 2 Foundational (`base-layout.ts`, T003–T005).
2. Phase 3 US1 (T006–T010): the leaked sliver appears.
3. **STOP and VALIDATE**: classify the un-blocked-`K_A` fixture; confirm the minor `Latn` entry with
   an unchanged dominant. This is the demonstrable core of the feature.

### Incremental Delivery

1. Setup + Foundational → resolution module ready.
2. US1 → leak visible (MVP).
3. US2 → safety guarantees proven (no-flip, `> nul` silent).
4. US3 → versioned deterministic recompute of the committed index.

### Notes

- [P] = different files, no incomplete-task dependency.
- Tests fail before implementation; commit after each task or logical group.
- The classifier fold (T008–T010, T012–T013) all edits **one file** (`script-classifier.ts`) — run
  sequentially, not in parallel.
- Constitution guardrail: never touch `buildProducedSet`, the IR, or the codec.
