---
description: "Task list for Per-Keyboard Facet Index"
---

# Tasks: Per-Keyboard Facet Index

**Input**: Design documents from `specs/036-keyboard-facet-index/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — the spec's User-Story Independent Tests, SC-003 (byte-diff extensibility), SC-004 (determinism + incremental), FR-008 (loud + lint validation), and [quickstart.md](quickstart.md) Scenarios A–F explicitly call for vitest coverage, a determinism assertion, and a lint self-check.

**Team**: Engine owns the build tool (`utilities/facet-index/`), the freshness plumbing, and the schema-validation lint (`utilities/facet-index-lint/`); Content owns the facet definitions (`content/keyboard-facets/`). Split mirrors spec §12 / plan Constitution Article VI. Branch: `km/facet-index`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Paths are repo-root-relative.

**Scope note (036 vs 037/038)**: This feature owns the artifact **shape**, its **extensibility**, its **schema validation**, and its **freshness/rescan** model, and lands exactly **one** facet — `script` — as the worked example that proves the shape (plan Summary; research D5/D8). The strategy-fingerprint and target/device-mix classifiers, and any refinement of the script classifier's internal algorithm, are [spec 037](../037-facet-classifiers/spec.md); user-facing confirmation is [spec 038](../038-adaptation-questions/spec.md). The `script` classifier here is the minimum needed to populate + validate the shape and satisfy SC-002 — it composes the already-public engine primitives inventoried in research D5.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the standalone tool skeleton, the lint skeleton, the content-definition dir, and the UCD version pin — no logic yet.

- [X] T001 Create the build-tool skeleton `utilities/facet-index/` — `package.json` (name `@keyboard-studio/facet-index`, `"private": true`, `"type": "module"`, description citing the provenance chain; no build step — run via `tsx`), `tsconfig.json` (own-tsconfig shape matching [utilities/kbgen/tsconfig.json](../../utilities/kbgen/tsconfig.json) / supportability-scanner; `module`/`moduleResolution` for ESM tsx). Mirror [utilities/supportability-scanner/](../../utilities/supportability-scanner/) (research D1).
- [X] T002 [P] Create `scripts/ucd-version.json` — pinned `unicodeVersion: "17.0.0"`, a `files[]` array of the 4 pinned UCD files (`Scripts.txt`, `ScriptExtensions.txt`, `PropertyValueAliases.txt`, `Blocks.txt`) each `{ path (under lib/ucd/), sha256: "PLACEHOLDER" }`, `license` (Unicode license) + `notice`. Shape mirrors [scripts/langtags-version.json](../../scripts/langtags-version.json) (research D2).
- [X] T003 [P] Create the lint skeleton `utilities/facet-index-lint/index.js` — CommonJS entry, `facet-lint` style (named checks + a self-check stub, prints `[OK]`/`[ERROR]`, non-zero exit on failure). Mirror [utilities/facet-lint/index.js](../../utilities/facet-lint/index.js). Logic lands in Phase 6.
- [X] T004 [P] Create the content-definition directory `content/keyboard-facets/` with a `README.md` describing the facet-definition discipline (data, not contract; graduation rule), cross-referencing [content/facets/README.md](../../content/facets/README.md) (research D3). No facet YAML yet (that is T014, content-owned).

**Checkpoint**: `npx tsx utilities/facet-index/cli.ts --help` (or an empty entry) runs; `node utilities/facet-index-lint/index.js` runs and exits 0 on an empty check set.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Produce the pinned UCD lookup, the shared types/constants, the corpus scanner, the freshness plumbing, and the deterministic JSON writer that every user story needs.

**⚠️ CRITICAL**: No user story can begin until the UCD lookup + scanner + writer exist.

- [ ] T005 Implement `utilities/facet-index/ucd/codegen-ucd.mjs` — read `lib/ucd/{Scripts,ScriptExtensions,PropertyValueAliases,Blocks}.txt`, SHA-256-verify each against `scripts/ucd-version.json` (fail loud + non-zero on `PLACEHOLDER`/mismatch, write nothing partial), derive a slim deterministic lookup (codepoint→canonical ISO-15924 script via `Scripts` normalized through `PropertyValueAliases`; `ScriptExtensions` set; `Blocks` ranges for the Latin sub-profile), emit `utilities/facet-index/ucd/generated/scriptLookup.ts` (sorted, write-only-on-change) + `utilities/facet-index/data/SOURCES.json` (per-file sha256 + `unicodeVersion`). Port [scripts/fetch-langtags.mjs](../../scripts/fetch-langtags.mjs) verify/`--compute-sha` + [scripts/codegen-langtags.mjs](../../scripts/codegen-langtags.mjs) determinism (research D2; FR-005).
- [ ] T006 Run `node utilities/facet-index/ucd/codegen-ucd.mjs --compute-sha` to fill the real hashes in `scripts/ucd-version.json`, then re-run without the flag to produce and commit `ucd/generated/scriptLookup.ts` + `data/SOURCES.json` (depends on T002, T005).
- [ ] T007 [P] Define shared types in `utilities/facet-index/types.ts` — `FacetDefinition`, `Categorization`, `KeyboardRecord`, `IndexManifest`, `FacetIndex`, `ProvenanceTier`, `AnalysisOutcome`, `ConfidenceClass` — from [data-model.md](data-model.md) Entities 1–3 and [contracts/facet-index.schema.md](contracts/facet-index.schema.md). Reuse `ImportStatus` semantics from `@keyboard-studio/contracts` (research D5) rather than forking an outcome enum.
- [ ] T008 [P] Implement the deterministic JSON writer `utilities/facet-index/writeStable.ts` — stable stringify (2-space, recursively sorted object keys), write-only-if-changed; no timestamps in the payload (FR-006; research "Determinism recipe"). Mirrors `codegen-langtags.mjs` output discipline.
- [ ] T009 Implement the corpus scanner `utilities/facet-index/scan.ts` — walk `../keyboards/release/<vendor>/<id>/`, match the `KPS_PATH_RE` scope, resolve `id` = directory name, discover source files (`.kmn` + siblings via `parseKmnHeaderStores`), read their bytes. Fail loud with a clear message if `../keyboards` is absent (Edge Case). Follow [utilities/supportability-scanner/scan.ts](../../utilities/supportability-scanner/scan.ts) (research D6).
- [ ] T010 Implement freshness plumbing `utilities/facet-index/freshness.ts` — per-file SHA-256, per-keyboard `sourceHashes`, an incremental diff (changed vs prior committed index), and the version-bump full-rescan gate (`scannerVersion`/`unicodeVersion` change ⇒ recompute all content-derived) (FR-005; research D6). Export a `scannerVersion` constant (combined tool+schema+classifier stamp).

**Checkpoint**: UCD lookup generated + committed; scanner enumerates the corpus; writer + freshness helpers unit-callable. Types available to all stories.

---

## Phase 3: User Story 1 - Downstream consumer looks up a keyboard's facet values (Priority: P1) 🎯 MVP

**Goal**: Build the committed index so any consumer can look up a corpus keyboard by id and read a facet's dominant value, full likelihood distribution, provenance tier, analysis outcome, and freshness — offline, no corpus checkout, no studio change.

**Independent Test**: With an index built for the sibling corpus, look up a known Arabic-script and a known Latin-script keyboard; each returns the correct dominant script, a distribution summing to 1, a named provenance tier, and a freshness stamp. An undefined facet id errors explicitly.

### Tests for User Story 1

- [ ] T011 [P] [US1] Script-classifier unit tests in `utilities/facet-index/script-classifier.test.ts` — fixture IRs: an Arabic-dominant produced set ⇒ `value: 'Arab'`, distribution dominant on `Arab`, `provenanceTier: 'content-derived'`; a Common/Inherited-only set ⇒ neutral (no dilution, via ScriptExtensions); an unparseable keyboard ⇒ `analysisOutcome: 'fallback-only'`, tier ≠ content-derived (US1 acceptance 1–2; FR-003/FR-004/FR-010).
- [ ] T012 [P] [US1] Reader/lookup tests in `utilities/facet-index/reader.test.ts` — `readFacet(index, keyboardId, facetId)` returns the categorization; an unknown facet id throws an explicit "unknown facet id" error (US1 acceptance 3); a missing keyboard errors clearly.
- [ ] T013 [P] [US1] Full-build smoke test in `utilities/facet-index/build-index.test.ts` — over a small fixture corpus, every keyboard has a `facets.script` record (SC-001, X3); `manifest.keyboardCount === |keyboards|`; `facetCoverage` tier counts sum to keyboardCount (X5).

### Implementation for User Story 1

- [ ] T014 [US1] **(Content)** Author `content/keyboard-facets/script.yaml` — the v1 facet definition: `id: script`, `valueType: histogram`, `limits.values` = closed ISO-15924 set, `likelihoodSemantics`, `derivation` (archetype `character-content`, `classifierId: script-classifier`, `fallbackChain`), `feedsSessionFacets: [community.multi-orthography]`, `subProfiles.latin`, `schemaVersion: 1`. Per [data-model.md](data-model.md) sample + [contracts/facet-definition.schema.md](contracts/facet-definition.schema.md) (FR-002/FR-009).
- [ ] T015 [US1] Implement the script classifier `utilities/facet-index/script-classifier.ts` — `parseKmn` (wrap only `parse()` in try/catch), `buildProducedSet(ir)`, map each concretely-scripted character to its ISO-15924 script via the pinned UCD lookup (Common/Inherited neutral; ScriptExtensions strengthen, never dilute), emit the histogram `distribution` + dominant `value` + `evidenceSize` + `confidenceClass`. Compose the engine primitives from research D5; internal algorithm refinements are 037.
- [ ] T016 [US1] Implement the analysis-outcome + coverage mapping in `utilities/facet-index/outcome.ts` — map `ImportStatus` (Clean/CleanWithOpaque/ParseFailure) → `analysisOutcome` (fully/partially/fallback-only) and compute `analyzedCoverage` = `1 − opaque share` from IR nodes (research D5; FR-010). Reused by every classifier.
- [ ] T017 [US1] Implement the fallback chain `utilities/facet-index/fallback.ts` — when content analysis is unavailable (parse failure / no scripted output), derive script from declared `.kps` metadata (declared-metadata tier), then from langtags default-script for the declared BCP47 (default-fallback tier), else `undetermined`; set `provenanceTier` accordingly (FR-004; research D2/D5).
- [ ] T018 [US1] Implement the build orchestrator `utilities/facet-index/build-index.ts` — load facet defs → scan corpus → per keyboard run classifiers + fallback + outcome → assemble records + per-keyboard freshness → build the manifest (`facetCoverage`, `facetIds`, `keyboardCount`, `referencePins`, `corpusCommit`) → write via `writeStable` to `docs/keyboard-facet-index.json` (FR-001, SC-001). Fail loud (exit 1) on a missing facet record.
- [ ] T019 [US1] Implement the reader helper `utilities/facet-index/reader.ts` — `readFacet` / `getKeyboard` over the artifact with explicit unknown-facet / unknown-keyboard errors (US1 acceptance 3). This is the consumer-facing surface.
- [ ] T020 [US1] Implement the CLI entry `utilities/facet-index/cli.ts` — `--limit`, `--check`, `--quiet` flags (supportability-scanner style); default = full build; prints `[OK] N keyboards, M facets, 100% coverage`. Wire to `build-index.ts`.
- [ ] T021 [US1] Run the full build (`npx tsx utilities/facet-index/cli.ts`) against `../keyboards/release/**`; commit `docs/keyboard-facet-index.json` (depends on T014–T020; requires the sibling corpus checkout). Record `keyboardCount` in the PR.

**Checkpoint**: US1 is a usable, independently-testable committed index (MVP) — the script facet is queryable offline for every corpus keyboard.

---

## Phase 4: User Story 2 - Facet author adds a new keyboard-level facet (Priority: P2)

**Goal**: A content author adds a facet definition and the next build populates it corpus-wide without reshaping or invalidating any existing facet's records; out-of-limits values fail the build loud.

**Independent Test**: Add a trivial new facet (a boolean from package metadata), rebuild, diff: existing `facets.script` records byte-identical; every keyboard gains exactly one new categorization. A classifier emitting an out-of-limits value fails the build.

### Tests for User Story 2

- [ ] T022 [P] [US2] Extensibility byte-diff test in `utilities/facet-index/extensibility.test.ts` — build with N facets, add a definition, rebuild; assert every prior-facet record is byte-identical and each keyboard gained exactly one new key (SC-003; data-model "extensibility invariant").
- [ ] T023 [P] [US2] Build-time schema-violation test in `utilities/facet-index/validate.test.ts` — a classifier emitting a value outside `limits`, or a `distribution` not summing to ~1 (residue-scoped), causes the build to exit non-zero and record nothing (FR-008; US2 acceptance 2; contract X1/X2).

### Implementation for User Story 2

- [ ] T024 [US2] Implement the facet-definition loader + validator `utilities/facet-index/load-defs.ts` — read `content/keyboard-facets/*.yaml`, validate each against [contracts/facet-definition.schema.md](contracts/facet-definition.schema.md) (C1 id↔path, C2 uniqueness, C3 limits↔valueType), fail loud on violation (US2 acceptance 3). Uses the root `yaml` devDependency.
- [ ] T025 [US2] Implement build-time record validation `utilities/facet-index/validate.ts` — enforce X1 (value + distribution keys within `limits`), X2 (distribution/residue sum), X4 (outcome↔tier), invoked inside `build-index.ts` before write; any violation ⇒ `[ERROR]` + exit 1, never recorded (FR-008; research D7). A closed-set `open: true` facet skips the closed-set check but keeps shape checks.
- [ ] T026 [US2] Confirm the shell is facet-agnostic — `build-index.ts` iterates `facetIds` generically and each categorization is self-contained (no cross-facet references); add a second demo/fixture facet path in tests only (not a shipped `content/` YAML) to prove pure-addition (SC-003). Refactor any script-specific coupling out of the shell.

**Checkpoint**: US1 + US2 both work; the index grows by adding a definition, and bad values are caught at build time.

---

## Phase 5: User Story 3 - Maintainer rescans the corpus incrementally (Priority: P3)

**Goal**: A maintainer re-runs the build after pulling corpus commits; only changed keyboards re-analyze, the rest carry forward byte-for-byte; a Unicode/scanner version bump forces a full content-derived recompute; corrupt UCD pins fail loud.

**Independent Test**: Rebuild an unchanged corpus ⇒ byte-identical; touch one keyboard's source ⇒ only that keyboard's records + the manifest differ; bump `scannerVersion`/`unicodeVersion` ⇒ all content-derived records recompute.

### Tests for User Story 3

- [ ] T027 [P] [US3] Determinism test in `utilities/facet-index/determinism.test.ts` — build twice over a fixture corpus ⇒ byte-identical `keyboard-facet-index.json` (FR-006, SC-004), mirroring the langtags determinism test.
- [ ] T028 [P] [US3] Incremental-rescan test in `utilities/facet-index/incremental.test.ts` — with a prior index, changing one keyboard's source hash re-analyzes only that keyboard (+ manifest `corpusCommit`/`facetCoverage`); a `scannerVersion` bump forces full recompute (SC-004; US3 acceptance 1–3).
- [ ] T029 [P] [US3] UCD fetch-guard test in `utilities/facet-index/ucd/codegen-ucd.test.ts` — a placeholder/mismatched `sha256` causes `codegen-ucd.mjs` to exit non-zero without writing a partial lookup (FR-005; research D2).

### Implementation for User Story 3

- [ ] T030 [US3] Wire `--incremental` into `cli.ts` + `build-index.ts` — read the prior committed index, use `freshness.ts` to select changed keyboards, carry forward unchanged records verbatim, recompute only the dirty set; a version-bump gate short-circuits to full recompute (FR-005; research D6).
- [ ] T031 [US3] Author `utilities/facet-index/README.md` — the run procedure (full + `--incremental`), the pin-bump-forces-rescan guarantee, the offline/no-runtime-IO invariant, and the corpus-scope note (FR-005; quickstart Setup/Scenario D).

**Checkpoint**: The index is maintainable via cheap incremental rescan with loud failure on tampered reference data.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T032 Implement the full artifact lint `utilities/facet-index-lint/index.js` — checks X1–X7 over `docs/keyboard-facet-index.json` against `content/keyboard-facets/*.yaml`, plus definition checks C1–C5, plus the X7/C5 self-check (rejects a synthetic bad record + accepts a good one). Mirror [utilities/facet-lint/index.js](../../utilities/facet-lint/index.js) (FR-008; research D7; contract cross-checks).
- [ ] T033 Wire `facet-index-lint` into `pnpm lint` — append `node utilities/facet-index-lint/index.js` to the root `package.json` `lint` chain after `facet-lint` (FR-008; research D7).
- [ ] T034 [P] Emit the human-readable companion `docs/keyboard-facet-index.md` from `build-index.ts` (audit trail: per-facet coverage, sample rows, build inputs) and add rows for **all three** corpus artifacts (`keyboard-facet-index.json`, `keyboard-facet-index.md`, and the pre-existing missing `placement-priors.json` / `import-corpus.json`) to `docs/MANIFEST.md` (research D4 pre-existing-gap note; FR-007).
- [ ] T035 [P] **(Doc)** Fix the spec-corpus count in `content/facets/**` prose / signoff: the "fourteen `corpus:` derivations, all `planned`" claim is actually **12** (`corpus:`-prefixed), **10 planned + 2 available**; correct the one-line reference and note the 4 session facets that can now name a concrete index field (research D8; SC-005). Do **not** flip any `sourceStatus` (that is the follow-up wiring feature).
- [ ] T036 [P] Add the `utilities/facet-index` + `utilities/facet-index-lint` rows to the CLAUDE.md "Standalone utilities" inventory and the commands table (`facet-index-lint` under `pnpm lint`) (house convention).
- [ ] T037 Verify `pnpm lint` (incl. the new `facet-index-lint`) and `pnpm typecheck` pass; run the [quickstart.md](quickstart.md) Scenarios A–F end-to-end (record the SC-002 hand-verified ≥20-keyboard / ≥5-script sample result and the concrete Arabic + Latin keyboard ids used) — evidence in the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no deps.
- **Foundational (P2)**: after Setup; **blocks all stories** (UCD lookup T005/T006, scanner T009, writer T008, freshness T010, types T007 are prerequisites).
- **US1 (P3)**: after Foundational. MVP — lands the `script` facet + build + reader.
- **US2 (P4)**: after US1 (extensibility + validation operate on the built shape and the def loader).
- **US3 (P5)**: after US1 (incremental reads a prior index); the determinism + fetch-guard tests can run once US1/Foundational exist. Can overlap US2.
- **Polish (P6)**: after the stories it covers (lint T032/T033 after US2 validation shape is stable).

### Notable edges

- T002 → T005/T006 (pin must exist to verify); T005 → T006 (codegen before hashes/commit).
- T007/T008/T009/T010 → T015–T018 (classifier + build read types, writer, scanner, freshness).
- T014 (def) → T015/T018/T024 (classifier + build + loader read the script def).
- T018 → T021 (build must exist to run); T018 → T030 (incremental extends the orchestrator).
- T024/T025 → T032 (lint reuses the definition + record validation logic).

### Parallel opportunities

- Setup: T002, T003, T004 in parallel (T001 first).
- Foundational: T007, T008 in parallel; T009, T010 in parallel; T005 after T002, T006 after T005.
- US1 tests T011, T012, T013 in parallel (write-first); US2 tests T022, T023 in parallel; US3 tests T027, T028, T029 in parallel.
- US3 can proceed alongside US2 once US1 is done.
- Polish: T034, T035, T036 in parallel.

---

## Parallel Example: User Story 1

```bash
# Write US1 tests together (fail first):
Task: "Script-classifier unit tests in utilities/facet-index/script-classifier.test.ts"
Task: "Reader/lookup tests in utilities/facet-index/reader.test.ts"
Task: "Full-build smoke test in utilities/facet-index/build-index.test.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (UCD lookup + scanner + writer + freshness + types) → 3. Phase 3 US1 → **STOP & VALIDATE** the committed script index independently (it unblocks the wrong-script defect and names ≥4 session-facet sources on its own).

### Incremental delivery

Foundation → US1 (committed script index, MVP) → US2 (extensibility + build-time schema validation) → US3 (deterministic incremental rescan) → Polish (lint in `pnpm lint`, docs, quickstart evidence). Each story adds value without breaking the previous.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Tests are write-first within each story; verify they fail before implementing.
- **Team split**: `content/keyboard-facets/*.yaml` (T004, T014) + the count-correction doc (T035) are **content**-owned; everything under `utilities/` + `docs/` artifacts + freshness is **engine**-owned (spec §12).
- Keep the tool a standalone `utilities/*` (out of `pnpm -r`); run via `tsx`; import engine source by relative path (research D1). Do NOT add it to `packages/*`.
- Constitution: offline, deterministic, no runtime host-disk writes by the studio; the tool reads the sibling corpus at build time only (plan Constitution Check).
- Commit per task or logical group with `feat(tools): …` (engine) / `feat(criteria): …` (content defs) / `docs: …`; open the PR with `closes #N` only after AC reconciliation.
