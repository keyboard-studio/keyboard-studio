---
description: "Task list for 037 — Deterministic Facet Classifiers"
---

# Tasks: Deterministic Facet Classifiers (Script + Two Representative Facets)

**Input**: Design documents from [specs/037-facet-classifiers/](.)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — the spec explicitly requires them (FR-006 per-outcome fixtures, SC-003 determinism, quickstart Scenarios 1–6). Test tasks are first-class here, not optional.

**Organization**: Tasks are grouped by user story (US1 script / US2 strategy-fingerprint / US3 target-mix) so each classifier can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no incomplete dependency)
- **[Story]**: US1 / US2 / US3; Setup / Foundational / Polish tasks carry no story label
- Every task names an exact path

---

## ✅ Spec 036 harness has LANDED (READ FIRST) — supersedes the earlier "036 unimplemented" risk

037 owns **algorithms**; 036 owns the **harness** they plug into. As of this branch that harness is **present on disk and on `main`** (analyze concern D1 is resolved): `utilities/facet-index/build-index.ts` (the build loop + `DEFAULT_CLASSIFIERS` registry), `utilities/facet-index/ucd/generated/scriptLookup.ts` (pinned UCD 17.0.0 `scriptOf`/`scriptExtensionsOf`), `utilities/facet-index/types.ts` (Entity 1/2/3 types + `Categorization`), `utilities/facet-index/fallback.ts` (`deriveScriptFallback`), `utilities/facet-index/outcome.ts` (`mapImportStatus`/`computeAnalyzedCoverage`), the committed `docs/keyboard-facet-index.json`, `utilities/facet-index-lint/index.js` (wired into `pnpm lint`), and a **worked-example `script-classifier.ts` + `content/keyboard-facets/script.yaml`**. 037 therefore **plugs into** this harness, it does not stand it up.

**Layout reconciliation (supersedes the file paths written below).** The landed harness keeps classifiers **flat** under `utilities/facet-index/` (e.g. `script-classifier.ts`, `script-classifier.test.ts`), **not** in a `utilities/facet-index/classifiers/` subtree. Follow the shipped layout: `utilities/facet-index/strategy-fingerprint-classifier.ts` (+ `.test.ts`) and `utilities/facet-index/target-mix-classifier.ts` (+ `.test.ts`). Where a task below reads `utilities/facet-index/classifiers/<x>.ts`, read it as `utilities/facet-index/<x>.ts`. Classifiers are plain functions registered as `{ classify, fallback }` `ClassifierPair`s in `DEFAULT_CLASSIFIERS` (keyed by facet id) — the richer `Classifier` interface in [contracts/classifier.contract.md](contracts/classifier.contract.md) is an illustrative target to adapt to that shipped shape, not a second registry. Do not duplicate the harness — coordinate via the lockout registry (concurrent 036/039 work is active).

**US1 (script) is already partly built.** 036 shipped a worked-example `script-classifier.ts` + `fallback.ts` that implement the content-derived histogram (T011), the fallback chain (T014), and `analyzedCoverage`/outcome mapping. US1's job is to **extend/tune**, not rebuild: wherever a US1 task names `script.ts`, read it as the shipped **`script-classifier.ts`** (+ `script-classifier.test.ts`). Specifically 037 still owes the Latin sub-profile (T013, `subProfile` is reserved-but-unset in the shipped classifier), the desktop base-layout fall-through (T012), and any confidence-threshold tuning (the shipped `classifyConfidence` uses 0.9/0.5; data-model specifies ≥0.80 `confident` — reconcile these before closing US1). Guard against re-deriving what already ships.

## Concurrency / lockout note

Concurrent crews are active (036, 039). This tasks list is executed under the **lockout** skill: acquire a lock on each file (or the `utilities/facet-index/classifiers/` batch and any `content/keyboard-facets/*.yaml`) with `--team facet-037` **before** the first Edit/Write, release at task/checkpoint close. `content/keyboard-facets/` and `utilities/facet-index/` are the hot contention zones shared with 036 — lock narrowly, heartbeat long runs.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the classifier subtree and confirm the 036 harness the classifiers depend on.

- [X] T001 Confirm the landed 036 harness surface 037 consumes (D1 resolved — all present on `main`): `utilities/facet-index/build-index.ts` (+ `DEFAULT_CLASSIFIERS`), `utilities/facet-index/ucd/generated/scriptLookup.ts` (`scriptOf`/`scriptExtensionsOf`, UCD 17.0.0), `utilities/facet-index/{types,fallback,outcome}.ts`, `content/keyboard-facets/script.yaml`, and `utilities/facet-index-lint/index.js`. Note the exact exported signatures the new classifiers must match (`ClassifierPair = { classify, fallback }`, registry keyed by `def.id`) so US2/US3 adapt to them rather than inventing a parallel shape. No stubs needed.
- [X] T002 Add the engine/content ownership split note (Article VI: algorithms in `utilities/facet-index/`, definitions under `content/keyboard-facets/`) + the lockout coordination note to the **existing** `utilities/facet-index/README.md`. Do **not** create a `classifiers/` subtree — the landed harness keeps classifiers flat (see the layout-reconciliation note above).
- [X] T003 [P] Consume the **already-shipped** pinned UCD slim lookup `utilities/facet-index/ucd/generated/scriptLookup.ts` — exports `scriptOf(cp)`, `scriptExtensionsOf(cp)` (note: `scriptExtensionsOf`, not `scriptExtOf`; returns `undefined` when no extension set, else a canonically-sorted array), and `latinProfileOf(cp)` for the FR-010 Latin sub-profile (UCD 17.0.0; codepoint miss ⇒ `Zzzz`, never throws). No new codegen; confirm the exact export names the classifiers import against. (data-model Entity 2)
- [X] T004 [P] Confirm `tsx` + `vitest` resolve for `utilities/facet-index/` (standalone tool, out of `pnpm -r`); add/verify its local tsconfig so `pnpm exec vitest run utilities/facet-index/classifiers/*.test.ts` works.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `Classifier` contract, the per-keyboard input assembly, and the reference-data loader — all three classifiers depend on these.

**⚠️ CRITICAL**: No user-story classifier work can begin until this phase is complete.

- [X] T005 Implement the shared `Classifier` interface + `Categorization` + `ClassifierInputs` + `Archetype` types in `utilities/facet-index/classifiers/classifier.ts`, verbatim to [contracts/classifier.contract.md](contracts/classifier.contract.md) (C1–C8 obligations). Pure/deterministic contract; no `Date.now()`/`Math.random()`.
- [X] T006 Implement `ClassifierInputs` assembly in the build loop — one `assembleInputs(keyboardId)` per keyboard producing `{ ir, parseError, producedSet, recognizedRatio, kps, siblingStores, siblingPresent }` from `parseKmn`, `buildProducedSet`, `recognizePatterns`, `parseKps`, `parseKmnHeaderStores`, and fs existence checks — in `utilities/facet-index/build-index.ts` (or a `classifiers/inputs.ts` if 036's loop is not yet present). Reuse the single parse (no second parse; plan Performance Goals). `ir === null` on parse throw → fallback-only path (C6).
- [X] T007 [P] Implement the `ReferenceData` loader in `utilities/facet-index/classifiers/refs.ts`: wraps the UCD slim lookup (`scriptOf`/`scriptExtOf`/`blockOf`) and `getLanguageDefaults` (langtags tier-3 default script). Pins recorded for the 036 manifest (FR-004).
- [X] T008 Wire the new classifiers into the **landed** build loop: register `strategy-fingerprint` and `target-mix` in `DEFAULT_CLASSIFIERS` in `build-index.ts` (the shipped registry is `Record<facetId, ClassifierPair>` keyed by **`def.id`** — the facet id, *not* `derivation.classifierId`). Each pair follows the shipped `{ classify, fallback }` shape (see `script`'s `{ classify: classifyScript, fallback: scriptFallback }`); `build-index.ts` already iterates defs, looks up `classifiers[def.id]`, and writes each `Categorization`. `derivation.classifierId` stays a `<facet>-classifier` freshness/doc label, never used as a key.

**Checkpoint**: Contract + inputs + refs ready — the three classifiers can now be built in parallel.

---

## Phase 3: User Story 1 — Script classification with likelihood (Priority: P1) 🎯 MVP

**Goal**: For every corpus keyboard, a deterministic per-script likelihood distribution + dominant script, with a fallback chain (content → declared subtags → language default → undetermined), a Latin sub-profile (plain/extended/IPA), and provenance tier recorded.

**Independent Test**: `pnpm exec vitest run utilities/facet-index/classifiers/script.test.ts` — dominant script + distribution match hand judgments across Arabic / Devanagari / Cyrillic / plain-Latin / IPA / extended-Latin / dual-script fixtures (quickstart Scenario 1).

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T009 [P] [US1] Fixture test `utilities/facet-index/classifiers/script.test.ts` covering one clear-cut case per outcome from real corpus keyboards (FR-006): Arabic-script → `value:"Arab"` `confident` (Common/Inherited punctuation excluded from denominator, presentation-forms counted); plain-Latin → `Latn` + `subProfile.latin:"plain"`; IPA → `Latn` + `subProfile.latin:"ipa"`; dual-script → split `distribution` `mixed`; symbols-only → `evidenceSize:0`, `provenanceTier ≠ content-derived`, `undetermined` (no divide-by-zero).
- [ ] T010 [P] [US1] Add fixture cases for the fallback chain (FR-011) and the 2026-07-16 leak edge case: unparseable/opaque keyboard → declared-subtag tier then langtags default tier, tier recorded (AS3); a non-Latin keyboard with an un-blocked base-layout key → the leaked Latin char appears as a small off-script sliver in `distribution` (spec Edge Cases amendment), reading `&baselayout` not an assumed default.

### Implementation for User Story 1

- [X] T011 [US1] Implement the content-derived histogram in `utilities/facet-index/classifiers/script.ts`: iterate `producedSet` (NFC scalars), map each via `scriptOf`/`scriptExtOf`, exclude `Zyyy`/`Zinh`/`Zzzz` from the denominator (FR-008), give **full weight** to every `Script_Extensions` member, normalize by weighted total, sort keys; `0/0 → 0` (FR-007–FR-009). Count `Zzzz` unknowns distinctly in `notes`.
- [ ] T012 [US1] Add desktop base-layout fall-through to produced evidence (FR-007 amendment): include un-blocked base-layout characters (chars not blocked via the `[K_x] > nul` idiom), read from the keyboard's own `&baselayout` store; default base only when unset, and record the default-vs-declared distinction in provenance. Desktop-only (touch keys are explicit JSON, no fall-through). — same file `script.ts`
- [X] T013 [US1] Implement the Latin sub-profile (FR-010) in `script-classifier.ts`: when `value === "Latn"`, derive `subProfile.latin ∈ {plain, extended, ipa}` using the **already-generated `latinProfileOf(cp)`** from `ucd/generated/scriptLookup.ts` (do not re-derive block ranges by hand) against a Latin-specific evidence floor, and populate `Categorization.subProfile` (the shipped classifier reserves but does not yet set this — see its header note). Label it a hint, not an orthography claim.
- [X] T014 [US1] Implement the fallback chain + confidence/outcome classing in `script.ts`: content (≥10 concrete chars AND ≥50% coverage) → declared script subtags → `getLanguageDefaults().defaultScript` → undetermined; set `confidenceClass` (dominant ≥0.80 `confident`, else `mixed`, no evidence `undetermined`), `provenanceTier`, `evidenceSize`, `analyzedCoverage = 1 − opaqueShare`, `analysisOutcome` (fully/partially/fallback-only). (FR-011, data-model Entity 3a, C4–C7). **`undetermined` is NOT a fourth `provenanceTier`** (resolved, analyze U1): follow the shipped `fallback.ts` — an undetermined outcome carries `value: "undetermined"` (reserved sentinel, in `limits.values`) + `confidenceClass: "undetermined"` with `provenanceTier` staying `default-fallback`; the enum keeps its three values and the manifest's `undetermined` coverage bucket is keyed off `value === "undetermined"`. Reuse `deriveScriptFallback` rather than reimplementing the tier walk.
- [X] T015 [US1] `content/keyboard-facets/script.yaml` **has already shipped** (036 landed): histogram over the closed ISO 15924 set + the reserved `undetermined` sentinel, `id: script`, `derivation.classifierId: script-classifier`, `fallbackChain: [content-derived, declared-metadata, default-fallback, undetermined]`. Verify only that the **facet `id`** (`script`) matches its `DEFAULT_CLASSIFIERS` registry key; `derivation.classifierId` is the `<facet>-classifier` doc label, not the key. For the two new facets, ship their YAML with the same convention (`id` = registry key = facet id; `classifierId` = `<facet>-classifier`). **Content-team-owned** (Article VI).
- [X] T016 [US1] Add any newly-cited fixture keyboards to the phonebook [docs/keyboard-index.md](../../docs/keyboard-index.md) (mandatory — read each keyboard's `.kps` for name/BCP47/author).

**Checkpoint**: Script classifier passes its fixtures, is deterministic, and emits a valid Entity 2 record — MVP delivered.

---

## Phase 4: User Story 2 — Strategy fingerprint classification (Priority: P2)

**Goal**: For every analyzable keyboard, a prevalence distribution over recognized `StrategyId`s (S-01..S-13) plus a distinct unrecognized-`residue` share, never presenting partial recognition as full coverage; parse failure states its outcome explicitly.

**Independent Test**: `pnpm exec vitest run utilities/facet-index/classifiers/strategy-fingerprint.test.ts` — fingerprints name expected strategies (quickstart Scenario 2).

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T017 [P] [US2] Fixture test `utilities/facet-index/classifiers/strategy-fingerprint.test.ts` (FR-006, SC-004): `akan` → dominant `S-01` low residue `confident`; `sil_euro_latin`/`basic_kbdfr` → `S-02` deadkey present, plausibly mixed with `S-01`; `sil_yoruba8` → high `residue`, distribution names only recognized strategies (`residue` a **distinct field**, never a distribution key); deliberately parse-failing input → `analysisOutcome:"fallback-only"`, `distribution` omitted, `notes` reason.

### Implementation for User Story 2

- [X] T018 [US2] Implement `utilities/facet-index/classifiers/strategy-fingerprint.ts`: from the recognizer output, `distribution[S] = strategyRuleCount(S) / totalRules` (zero-share ids omitted, keys sorted), `residue = 1 − recognizedRatio` as a distinct field; dominant `value` omitted when residue dominates / undetermined. (FR-012, data-model Entity 3b, C3 residue-scoped sum invariant)
- [X] T019 [US2] Compute `analyzedCoverage` in `strategy-fingerprint.ts` with the **same parse-opacity definition script uses** (`1 − opaqueShare`, `opaqueShare = ir.raw.length / (typedRuleCount + ir.raw.length)`) — kept distinct from `residue` (recognizer-gap). Set `confidenceClass`, `provenanceTier`, `evidenceSize = totalRules`, `analysisOutcome`; on parse failure return fallback-only per C6. Stability under comment/whitespace changes (FR-013, function of parsed structure).
- [X] T020 [US2] Ship `content/keyboard-facets/strategy-fingerprint.yaml` (histogram over S-01..S-13, `open:false`, residue semantics documented, recognizer covers S-01/S-02 as of classifier v1, `feedsSessionFacets: [lineage.strategy-fingerprint]`). **Content-team-owned** (data-model sample). Add any newly-cited fixtures to [docs/keyboard-index.md](../../docs/keyboard-index.md).

**Checkpoint**: Strategy-fingerprint classifier passes fixtures and its record is sufficient for the `lineage.strategy-fingerprint` / `recognized-strategy-distribution` derivation (SC-004).

---

## Phase 5: User Story 3 — Target/device-mix classification (Priority: P3)

**Goal**: For every keyboard, the device-class set {desktop, touch, web} from declared targets unioned with touch-layout artifact presence, with per-source provenance and declaration/artifact mismatch flagged; artifact outranks declaration.

**Independent Test**: `pnpm exec vitest run utilities/facet-index/classifiers/target-mix.test.ts` — each fixture classifies to the right device set (quickstart Scenario 3).

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T021 [P] [US3] Fixture test `utilities/facet-index/classifiers/target-mix.test.ts` (FR-006, SC-004): desktop-only (`<Targets>` absent) → `value:["desktop"]`, `provenanceTier:"default-fallback"`; touch-layout sibling present → `value` includes `"touch"` even if declaration omits it, `notes` mismatch flag (artifact outranks declaration, FR-014 AC1); `web`-declaring → includes `"web"`; `&TARGETS 'any'` → `["desktop","touch","web"]` (sentinel expanded).

### Implementation for User Story 3

- [X] T022 [US3] Implement `utilities/facet-index/classifiers/target-mix.ts`: union of `.kps <Targets>` (enum-validated, defaults to `windows`/desktop when absent — AC2), `.kmn &TARGETS` (raw; `'any'` → all device classes), and touch-layout artifact presence (`LAYOUTFILE` sibling via `siblingPresent`); map `KeymanPlatformTarget` → {desktop, touch, web}; per-member per-source provenance in `distribution`; flag declaration/artifact mismatch in `notes` (FR-014, data-model Entity 3c, C5).
- [X] T023 [US3] Ship `content/keyboard-facets/target-mix.yaml` (set over {desktop, touch, web}, `open:false`, `feedsSessionFacets: [env.device-mix]`). **Content-team-owned** (data-model sample). Add any newly-cited fixtures to [docs/keyboard-index.md](../../docs/keyboard-index.md).

**Checkpoint**: All three classifiers are independently functional and emit valid Entity 2 records.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Determinism proof, corpus coverage measurement, lint wiring, and audit documentation across all three classifiers.

- [X] T024 [P] Determinism test `utilities/facet-index/classifiers/determinism.test.ts` (SC-003, FR-001): two runs over a fixed fixture input set produce byte-identical `Categorization` records for all three classifiers; assert sorted keys and no timestamps in the hashed payload.
- [X] T025 Full corpus run + coverage report: `build-index.ts` emits `facetCoverage.script` into the 036 manifest and asserts **≥80%** of keyboards classify at the `content` tier (SC-002, measured not assumed); all three facets appear in `facetIds`. Verify adding a facet definition leaves prior facets' records byte-identical (036 extensibility invariant).
- [X] T026 [P] Wire the three new facets into `facet-index-lint` (quickstart Scenario 6; value-within-`limits`/build-fails rule is **036 FR-008 / 036 D7**, not 037 FR-008): committed `docs/keyboard-facet-index.json` validates against `content/keyboard-facets/*.yaml` — value outside `limits`, distribution not summing to ~1 (or to 1−residue when residue present), or `fallback-only` claiming `content-derived` fails lint; the lint self-check rejects a known-bad and accepts a known-good record. Confirm `pnpm lint` includes it.
- [X] T027 [P] Auditability + classifier docs (SC-005): document each classifier's archetype, fallback chain, evidence floors, and version so a reviewer can trace any keyboard's value from `docs/keyboard-facet-index.md` + the record's `evidenceSize`/`analyzedCoverage`/`provenanceTier`/`residue` fields without re-running. Update [docs/architecture.md](../../docs/architecture.md) / [CLAUDE.md](../../CLAUDE.md) facet-index inventory if 037 changed the tool surface.
- [X] T028 Run all of quickstart.md (Scenarios 1–6) end-to-end and record pass/fail evidence; reconcile any 036-harness stubs stood up in Phase 1 with the landed 036 work before merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: start immediately; T001 gates whether Phase 2 builds on 036 or on flagged stubs.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (shared contract + inputs + refs).
- **User Stories (Phase 3–5)**: all depend on Phase 2. Independent of each other — can run in parallel once Phase 2 completes.
- **Polish (Phase 6)**: T024/T026/T027 depend on the classifiers they cover existing; T025/T028 depend on all three user stories.

### User Story Dependencies

- **US1 (P1)**: after Phase 2. No dependency on US2/US3. MVP.
- **US2 (P2)**: after Phase 2. Independent of US1/US3.
- **US3 (P3)**: after Phase 2. Independent of US1/US2.

### Within Each User Story

- Fixture tests written first and failing (T009/T010, T017, T021) before implementation.
- `.ts` classifier before its `.yaml` definition sign-off; phonebook update last.

### Parallel Opportunities

- Setup: T003, T004 in parallel.
- Foundational: T007 parallel with T005/T006 (different files); T008 after all three.
- Across stories: once Phase 2 done, US1 / US2 / US3 proceed fully in parallel (different files; only shared touch is `content/keyboard-facets/` and `build-index.ts` registry — lock those).
- Polish: T024, T026, T027 in parallel.

---

## Parallel Example: after Foundational completes

```bash
# Three classifiers in parallel (distinct files):
Task: "US1 script classifier + fixtures in utilities/facet-index/classifiers/script.ts + script.test.ts"
Task: "US2 strategy-fingerprint classifier + fixtures in utilities/facet-index/classifiers/strategy-fingerprint.ts + strategy-fingerprint.test.ts"
Task: "US3 target-mix classifier + fixtures in utilities/facet-index/classifiers/target-mix.ts + target-mix.test.ts"
```

> Lockout: acquire `--team facet-037` on `utilities/facet-index/classifiers/` and each `content/keyboard-facets/*.yaml` before the first write; `build-index.ts` and `content/keyboard-facets/` are shared with the concurrent 036/039 crews — lock narrowly, release at each checkpoint.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup (reconcile 036 harness).
2. Phase 2 Foundational (contract + inputs + refs) — blocks everything.
3. Phase 3 US1 script classifier.
4. **STOP and VALIDATE**: quickstart Scenario 1 + determinism on script fixtures.

### Incremental Delivery

Setup + Foundational → US1 (MVP, the facet the user named + the hardest, sets the standard) → US2 → US3, each validated independently, then Phase 6 polish (SC-002 coverage, SC-003 determinism, lint, audit docs).

---

## Notes

- [P] = different files, no incomplete dependency. [Story] maps a task to US1/US2/US3.
- **Engine team** owns `utilities/facet-index/classifiers/*.ts`; **content team** owns `content/keyboard-facets/*.yaml` and the SC-001 hand-judged validation-set judgments (Article VI).
- No locked-contract edits: classifiers *read* `Pattern.strategyId`/`StrategyId`/`ownedNodes` (existing) and emit into content-owned records.
- The SC-001 ≥30-keyboard hand-judged validation set is content-team judgment data — tracked separately from these code tasks.
- Determinism is defined relative to the pinned UCD + langtags versions; a pin bump forces recompute (036 freshness) — not a defect.
- Commit style `feat(engine)` for classifiers, `feat(criteria)`/`feat(content)` for facet YAML; no GitHub issue numbers in shipped code.

## Deferred (not shipped in this implement pass) — honest partial closure

- **T012 (desktop base-layout fall-through, FR-007 amendment)** and its dependent **T010 leak-edge fixture** are NOT implemented. The shipped `script-classifier.ts` derives its histogram from `buildProducedSet(ir)` only; folding in un-blocked `&baselayout` characters (reading the keyboard's own base-layout store and the `[K_x] > nul` blocking idiom) is a substantive change to 036-owned produced-set derivation and risks the byte-stable committed index. Deferred as a follow-up. Impact is bounded: the shipped script facet already reaches 97.3% content-tier coverage over the 918-keyboard corpus (SC-002 ≥80% satisfied without it). US1 MVP (script likelihood + fallback chain + Latin sub-profile + 0.80 confidence threshold) is delivered.
- **T005/T006/T007** are satisfied by the landed 036 harness (the `ClassifierPair` contract in `build-index.ts`, per-keyboard input assembly in the build loop, and the UCD/langtags refs in `outcome.ts`/`fallback.ts`/`scriptLookup.ts`) rather than by a new `classifiers/{classifier,inputs,refs}.ts` subtree — building that would duplicate the harness (see the layout-reconciliation note above).
