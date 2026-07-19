---
description: "Task list for Construction Facet Classifiers"
---

# Tasks: Construction Facet Classifiers

**Input**: Design documents from `/specs/041-construction-facet-classifiers/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included. The plan's Technical Context names per-classifier `.test.ts` + `determinism.test.ts` + `extensibility.test.ts` as deliverables, and the spec-037 archetype these follow ships a test per classifier. Test tasks are therefore first-class here.

**Organization**: Tasks are grouped by user story (P1/P2/P3) so each story is an independently buildable, independently testable increment. Per the plan's phasing note, `/speckit.implement` stops after each user-story phase (one conversation per phase).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup/Foundational/Polish carry no story label)
- All paths are repo-root-relative. The tool is standalone `utilities/facet-index/` — not a `packages/*` target, not part of `pnpm -r`.

## Path Conventions

- Tool code + tests: `utilities/facet-index/*.ts` (classifiers flat; `.test.ts` beside each)
- Fixtures: `utilities/facet-index/__fixtures__/corpus/release/fixture/`
- Facet definitions (content data): `content/keyboard-facets/*.yaml`, `content/facets/orth/display-difficulty.yaml`
- Artifact validators: `utilities/facet-index-lint/index.js`, `pnpm run facet-lint`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the build/test envelope the classifiers depend on.

- [X] T001 Run `pnpm install` and one full `pnpm build` so the facet-index tool's imports (`@keyboard-studio/engine` codec + recognizer, langtags + `utilities/facet-index/ucd/generated/`) resolve; confirm `cd utilities/facet-index && npx vitest run` is green on the existing suite before any change (baseline).
- [X] T002 Confirm `node utilities/facet-index-lint/index.js` and `pnpm run facet-lint` both pass on the current `--classified-only` artifact (baseline for the "must still pass after each facet lands" gate, FR-041).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared shell changes every US1 desktop classifier (and, later, the touch classifiers) build on: the extended `Categorization`, the `ClassifierPair` signature, the cause-predicate library, and the shared measurement assembly. Rides with P1 per the plan's phasing note.

**⚠️ CRITICAL**: No classifier task can begin until this phase is complete.

- [X] T003 Extend the tool-local `Categorization` in `utilities/facet-index/types.ts` additively: optional `consistency?: number`, `causeTagCounts?: Record<CauseTag, number>`, `notApplicable?: true`; add the `CauseTag` union (`principled-split | capacity-forced | gap-omission`) and the `ExceptionSite` / `ClassifierContext` interfaces (data-model Entities 1–4). Keep all new fields optional so existing classifiers and `facet-index-lint` are unaffected.
- [X] T004 Extend the `ClassifierPair.classify` signature in `utilities/facet-index/build-index.ts` from `(ir, def)` to `(ir, def, kb: ScannedKeyboard)` (R1, contract classifier-registry §ClassifierPair). Thread `kb` at the single per-keyboard call site; confirm the three existing classifiers (`script`, `strategy-fingerprint`, `target-mix`) compile unchanged (they ignore `kb`).
- [X] T005 [P] Create the cause-predicate library `utilities/facet-index/cause-predicates.ts`: an ordered array of `CausePredicate` `{id, guard(ctx), fits(exceptions, ctx)}` with the two starters — `character-class` (guard = script family ∈ {Latin, Cyrillic, Greek}; fits = all deviations are combining marks → `principled-split`) and `layer-capacity` (no guard; fits = deviations begin exactly after the primary layer filled → `capacity-forced`); `gap-omission` is the residue, not a predicate (FR-002/003/004, R4).
- [X] T006 Create the shared assembly `utilities/facet-index/measurement.ts`: given (dominant value, analyzed site list, cause-predicate library, `ClassifierContext`) produce the `{value, consistency, causeTagCounts, provenanceTier: "content-derived", evidenceSize, analyzedCoverage, analysisOutcome, ...}` shape (contract measurement-model §Assembly rules). Enforce: consistency = matchingSites / analyzedSites (opaque regions excluded); consistency == 1 ⟹ no cause predicates run, `causeTagCounts` omitted; lexicographic tie-break for determinism (FR-001/005/006). Reuse `mapImportStatus` / `computeAnalyzedCoverage` from `outcome.ts`. Add a `notApplicable` builder emitting `{value: undefined, notApplicable: true, provenanceTier: "content-derived", notes}` (R3, FR-013/014/022).
- [X] T007 [P] Add `utilities/facet-index/cause-predicates.test.ts`: first-match-wins ordering, `character-class` guard fires only on {Latin,Cyrillic,Greek} and is skipped on abugida/abjad (falls through to `gap-omission`), empty exception set runs no predicate (Edge Cases, FR-004).
- [X] T008 [P] Add `utilities/facet-index/measurement.test.ts`: consistency arithmetic, consistency==1 ⟹ no `causeTagCounts`, opaque sites excluded from analyzed count, lexicographic tie-break, `notApplicable` builder shape (contract measurement-model §Acceptance).

**Checkpoint**: Foundation ready — the shared shape, signature, predicate library, and assembly exist and are unit-tested. Desktop classifier work can begin.

---

## Phase 3: User Story 1 - Desktop construction facets surfaced per base (Priority: P1) 🎯 MVP

**Goal**: Compute the nine facets readable from the parsed `KeyboardIR` (or script identity) — `caps-handling`, `casing`, `desktop-combo-mechanism`, `encoding`, `fallback-posture`, `mnemonic-vs-positional`, `normalization-posture`, `reordering-rules`, `rule-store-compaction` — each carrying dominant value + consistency + cause-tag summary, and flip their definitions from `classifierId: planned` to a real id.

**Independent Test**: Rebuild `tsx utilities/facet-index/cli.ts --classified-only` and confirm the nine facets appear on corpus keyboards with a dominant value, a consistency measure, and (where consistency < 1) `causeTagCounts` — verifiable against `fx_arabic` / `fx_latin` and the new shape fixtures without any touch-layout parsing. `pnpm run facet-index-lint` passes.

### Fixtures for User Story 1

- [X] T009 [P] [US1] Add the US1 shape fixtures under `utilities/facet-index/__fixtures__/corpus/release/fixture/` (reuse `fx_arabic` caseless/abjad and `fx_latin` cased): a `&MNEMONICLAYOUT` keyboard (`fx_mnemonic`), a mixed quoted/`\u` output keyboard (`fx_encoding_mixed`), an unset-vs-set `&baselayout` pair (`fx_baselayout_unset` / `fx_baselayout_set`), and a `group(reorder)` keyboard (`fx_reorder`) (research R6).

### Implementation for User Story 1

- [X] T010 [P] [US1] `utilities/facet-index/casing-classifier.ts` (+ `.test.ts`): script-identity-driven; value ∈ `{cased, caseless, mixed}` from the `script` facet / langtags family (reused, not re-derived). Gate input for `caps-handling`. Register in `DEFAULT_CLASSIFIERS`.
- [X] T011 [P] [US1] `utilities/facet-index/caps-handling-classifier.ts` (+ `.test.ts`): value ∈ `{per-rule-duplication, any-index-fold, no-caps-rules, mixed}` from IR rule structure via `measurement.ts`; recorded `notApplicable` when `casing = caseless` (FR-013, AS-4). Register.
- [X] T012 [P] [US1] `utilities/facet-index/desktop-combo-mechanism-classifier.ts` (+ `.test.ts`): value ∈ `{direct-key, modifier-key, deadkey, context-match, os-compose}` from IR rule structure (FR-011). Register.
- [X] T013 [P] [US1] `utilities/facet-index/encoding-classifier.ts` (+ `.test.ts`): classify **per role** (`input`/`base`/`combining`) via `distribution`; include the input **match-kind axis** (`key-ref`/`char-ref`/`mixed`) recorded distinctly and never auto-normalized; minority spelling sites → exception sites/`causeTagCounts` (FR-012, AS-2). Register.
- [X] T014 [P] [US1] `utilities/facet-index/fallback-posture-classifier.ts` (+ `.test.ts`): value ∈ `{relies-on, blocks-comprehensively, mixed}`; read the keyboard's own `&baselayout` system store, unset ⇒ packaging default recorded **defaulted** (not declared); modality physical-only; leaked keys = exception sites (FR-015, AS-6). Register.
- [X] T015 [P] [US1] `utilities/facet-index/mnemonic-vs-positional-classifier.ts` (+ `.test.ts`): read `&MNEMONICLAYOUT`; tag as a **gate** facet (measured/surfaced, marked so downstream never offers it for transform) (FR-016, AS-3). Register.
- [X] T016 [P] [US1] `utilities/facet-index/normalization-posture-classifier.ts` (+ `.test.ts`): value ∈ `{nfc, nfd, mixed}`; recorded `notApplicable` for abugida/abjad families; the **backspace-match** signal layered as consistency/exception data, not a value (FR-014, AS-5). Register.
- [X] T017 [P] [US1] `utilities/facet-index/reordering-rules-classifier.ts` (+ `.test.ts`): value ∈ `{none, group-reorder-swap, inline-swap, mixed}` from the `group(reorder)` convention (FR-011). Register.
- [X] T018 [P] [US1] `utilities/facet-index/rule-store-compaction-classifier.ts` (+ `.test.ts`): inline-vs-store shape from the IR via `measurement.ts` (FR-011). Register.
- [X] T019 [US1] Flip `derivation.classifierId: planned → <real id>` in the nine desktop `content/keyboard-facets/*.yaml`: `caps-handling`, `casing`, `desktop-combo-mechanism`, `encoding`, `fallback-posture`, `mnemonic-vs-positional`, `normalization-posture`, `reordering-rules`, `rule-store-compaction` (FR-040). Single file-set edit after all nine classifiers register.
- [X] T020 [US1] Extend `utilities/facet-index/determinism.test.ts` and `extensibility.test.ts` to cover the nine new registrations (byte-identical rebuild; a `planned` def with no classifier still fails the non-`--classified-only` build loud) (FR-006, Edge Case).
- [X] T021 [US1] Run `cd utilities/facet-index && npx vitest run`, then `node utilities/facet-index-lint/index.js` — both green (FR-041, SC-003). Rebuild `tsx utilities/facet-index/cli.ts --classified-only` and confirm the nine facets appear per base against the US1 acceptance scenarios (quickstart P1).

**Checkpoint**: US1 is the MVP — nine desktop facets visible per base; zero `planned` among the nine; lint + tests green. Stop and validate (one conversation per phase). Resume P2 in a fresh conversation.

---

## Phase 4: User Story 2 - Touch-layout construction facets surfaced per base (Priority: P2)

**Goal**: Add a `.keyman-touch-layout` JSON reader and classify the four touch facets — `touch-combo-mechanism`, `touch-number-row`, `touch-symbol-layer`, `touch-modifier-layers` — from it; keyboards with no touch layout record all four `notApplicable`.

**Independent Test**: Rebuild the index; the four touch facets appear for keyboards that ship a `.keyman-touch-layout` and are `notApplicable` for desktop-only keyboards — verifiable against a touch-layout fixture with no `.kmn` rule-structure dependency. `facet-index-lint` passes.

### Fixtures for User Story 2

- [X] T022 [P] [US2] Add touch fixtures under `utilities/facet-index/__fixtures__/corpus/release/fixture/`: a `.keyman-touch-layout`-bearing keyboard with longpress popups + a 5th row + a symbol layer + reproduced ALT/RALT layers (`fx_touch`), and a desktop-only keyboard with no touch layout (reuse an existing desktop fixture) (research R6, AS-1/2/3).

### Implementation for User Story 2

- [X] T023 [US2] `utilities/facet-index/touch-layout.ts` (+ `.test.ts`): read + parse the `.keyman-touch-layout` JSON once from `kb.sources` (`collectSources` in `scan.ts` already carries the sibling); expose per-key combine mechanism, 5th-row presence/content, symbol-layer presence, and reproduced modifier layers (FR-020, data-model Entity 6). Absent file ⇒ signal callers to emit `notApplicable`.
- [X] T024 [P] [US2] `utilities/facet-index/touch-combo-mechanism-classifier.ts` (+ `.test.ts`): value ∈ `{key, layer, longpress, flick, multitap}` with distribution from `touch-layout.ts`; `notApplicable` when no touch layout (FR-021/022, AS-1). Register.
- [X] T025 [P] [US2] `utilities/facet-index/touch-number-row-classifier.ts` (+ `.test.ts`): value ∈ `{absent, digits, letters, mixed}`; `notApplicable` when no touch layout (FR-021/022). Register.
- [X] T026 [P] [US2] `utilities/facet-index/touch-symbol-layer-classifier.ts` (+ `.test.ts`): value ∈ `{present, absent}`; `notApplicable` when no touch layout (FR-021/022). Register.
- [X] T027 [P] [US2] `utilities/facet-index/touch-modifier-layers-classifier.ts` (+ `.test.ts`): value ∈ `{none, maps-desktop-modifiers, mixed}`; reproduced ALT/RALT sites carry the appropriate cause tag; `notApplicable` when no touch layout (FR-021/022, AS-3). Register.
- [X] T028 [US2] Flip `derivation.classifierId: planned → <real id>` in the four touch `content/keyboard-facets/*.yaml`: `touch-combo-mechanism`, `touch-number-row`, `touch-symbol-layer`, `touch-modifier-layers` (FR-040).
- [X] T029 [US2] Run `cd utilities/facet-index && npx vitest run` + `node utilities/facet-index-lint/index.js` — green; rebuild `--classified-only` and confirm the four touch facets against US2 acceptance (touch present vs `notApplicable`) (quickstart P2, FR-041, SC-004).

**Checkpoint**: US1 + US2 both work independently. Stop and validate; resume P3 in a fresh conversation.

---

## Phase 5: User Story 3 - Display-difficulty input facet (Priority: P3)

**Goal**: Add the new **input** facet `orth.display-difficulty`, derived per script from the Unicode block's first-assigned version (two era boundaries) and overridden to `poorly-supported` at script-level when corpus PUA usage is observed.

**Independent Test**: For a given script, confirm the facet yields `well/partially/poorly-supported` from block age, flipping to `poorly-supported` when PUA usage is present — verifiable per-script without the base classifiers. `pnpm run facet-lint` passes.

### Implementation for User Story 3

- [ ] T030 [US3] `utilities/facet-index/display-difficulty.ts` (+ `.test.ts`): pure `displayDifficultyOfScript(script, { puaObserved }) → "well-supported" | "partially-supported" | "poorly-supported"`. Primary = UCD block first-assigned version from `utilities/facet-index/ucd/generated/`, split at the two era boundaries (≤ 5.x → well; 6.0–10.0 → partially; ≥ 11.0 → poorly); `puaObserved` (script-level) forces `poorly-supported` (FR-030/031, data-model Entity 7, AS-1/2).
- [ ] T031 [US3] Edit `content/facets/orth/display-difficulty.yaml`: `sourceStatus: planned → available`; `source: → engine:displayDifficultyOfScript` (matching the `engine:detectBaseLayoutFamily` convention); record the two era-boundary values as derivation params (FR-030/031, data-model P3 row).
- [ ] T032 [US3] Run `pnpm run facet-lint` (validates `content/facets/*.yaml`) and the `display-difficulty.test.ts` — both green; confirm US3 acceptance (Basic Latin → `well-supported`; PUA-using script → `poorly-supported`) (quickstart P3).

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature acceptance and doc sync (SC-001..SC-005).

- [ ] T033 Determinism gate: rebuild `--classified-only` twice and diff — byte-identical (SC-003, quickstart whole-feature block). Confirm zero `classifierId: planned` remain in `content/keyboard-facets/` and 16 keyboard facets appear per base (SC-001).
- [ ] T034 [P] Update `utilities/facet-index/README.md` and the CLAUDE.md facet-index inventory line to list the 13 new classifiers + `display-difficulty.ts` + `touch-layout.ts` + `cause-predicates.ts` + `measurement.ts` (doc sync).
- [ ] T035 Run the full `pnpm lint` (includes `facet-index-lint`) and `pnpm typecheck` to confirm no cross-package regression from the `types.ts` / `build-index.ts` shell changes (FR-043 — no `packages/*` contract touch).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories** (the shared `Categorization`, `ClassifierPair` signature, `cause-predicates.ts`, `measurement.ts`).
- **US1 (Phase 3)**: depends on Foundational. Independently testable/shippable (MVP).
- **US2 (Phase 4)**: depends on Foundational (uses `measurement.ts` for the modifier-layer cause tags and the `notApplicable` builder). Independent of US1's classifiers.
- **US3 (Phase 5)**: depends only on Setup + the UCD data; independent of US1/US2 (different facet schema, `facet-lint` not `facet-index-lint`). Could start right after Setup if staffed separately.
- **Polish (Phase 6)**: depends on the desired stories being complete.

### Within Each User Story

- Fixtures before the classifiers that assert against them.
- Each classifier is self-contained (own file + own `.test.ts`) → parallelizable.
- The single facet-YAML flip (T019 / T028) comes **after** its story's classifiers register.
- The story's build/lint verification (T021 / T029 / T032) comes last in the story.

### Parallel Opportunities

- T005 + T007 and T006 + T008 pair up once T003/T004 land (predicate lib and measurement each ship with their test).
- **All nine US1 classifiers (T010–T018) are `[P]`** — distinct files, all depending only on the Phase 2 foundation. This is the bulk of the parallelism.
- The four US2 touch classifiers (T024–T027) are `[P]` once `touch-layout.ts` (T023) lands.
- US3 (T030–T032) can run fully in parallel with US1/US2 given separate staffing.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 (foundation) is green, launch the nine desktop classifiers together:
Task: "casing-classifier.ts + .test.ts"                    # T010
Task: "caps-handling-classifier.ts + .test.ts"             # T011
Task: "desktop-combo-mechanism-classifier.ts + .test.ts"   # T012
Task: "encoding-classifier.ts + .test.ts"                  # T013
Task: "fallback-posture-classifier.ts + .test.ts"          # T014
Task: "mnemonic-vs-positional-classifier.ts + .test.ts"    # T015
Task: "normalization-posture-classifier.ts + .test.ts"     # T016
Task: "reordering-rules-classifier.ts + .test.ts"          # T017
Task: "rule-store-compaction-classifier.ts + .test.ts"     # T018
# then serialize: T019 (flip nine YAMLs) -> T020 (determinism/extensibility) -> T021 (verify)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (the shared shell) → Phase 3 US1.
2. **STOP and VALIDATE**: nine desktop facets visible per base; `facet-index-lint` + tests green; determinism diff empty.
3. This is a shippable increment: 9 of 13 facets, no new scanning capability.

### Incremental Delivery (one conversation per phase)

1. Setup + Foundational + US1 → MVP (fresh conversation ends here).
2. US2 (touch reader + four touch facets) → validate → ship (fresh conversation).
3. US3 (display-difficulty input facet) → validate → ship (fresh conversation).
4. Polish: whole-feature SC gates + doc sync.

---

## Notes

- `[P]` = different files, no dependency on incomplete tasks.
- Every classifier ships its `.test.ts` in the same task (spec-037 archetype); no separate test phase.
- The facet-YAML `planned → real id` flip is deliberately batched per story so the `--classified-only` build only exposes a facet once its classifier is registered and tested.
- Do **not** implement value-*transition* logic — that is spec 039's scope (FR-042). This feature stops at measurement + surfacing.
- Stay inside `utilities/facet-index/` + `content/`; no `packages/*` contract or codec-parse-semantics change (FR-043).
- Commit after each task or logical group; use the `feat(tools)` / `feat(engine)` prefix.
