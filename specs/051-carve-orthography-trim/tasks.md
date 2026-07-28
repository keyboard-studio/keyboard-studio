# Tasks: Carve gallery trim proposals compare produced characters to the orthography (with cased-letter pairing)

**Feature**: `051-carve-orthography-trim` | **Branch**: `051-carve-orthography-trim`

**Inputs**: [spec.md](spec.md) · [plan.md](plan.md) · [research.md](research.md) · [data-model.md](data-model.md) · [quickstart.md](quickstart.md) · [contracts/collateral-guard.md](contracts/collateral-guard.md) · [contracts/case-pairing.md](contracts/case-pairing.md)

**Format**: `- [ ] **T###** [P?] [US#] Description · exact/file/path`
`[P]` = independent of the other tasks in its wave (different file, no incomplete dependency).

**Framing note carried from [research.md](research.md) §R1**: the produced-vs-input *domain* is already correct
(`buildProducedSet` walks `rule.output` only), so FR-001/FR-002 are **characterization** work, not new code. The
defect is downstream, in the collateral guard.

---

## Phase 1: Setup

Pin what already works before touching anything ([quickstart.md](quickstart.md) §0). If either characterization
test fails today, the §R1 diagnosis is wrong — stop and re-derive before touching the guard.

**Wave 1 — independent (different files):**

- [X] **T001** [P] Confirm the US1 fixture is reachable: sibling `../keyboards` checkout tracks the `keyboard-studio/keyboards` fork's `master`, `release/sil/sil_cameroon_qwerty` is present, and its phonebook row is accurate · `docs/keyboard-index.md`
- [X] **T002** [P] Characterization test (invariant D2a, FR-001/FR-002): a character appearing **only** in an `any()`-consumed store is absent from `buildProducedSet(ir)` · `packages/contracts/src/ir/producedSet.test.ts`
- [X] **T003** [P] Characterization test (invariant D2b, FR-002): the same input-only character never appears in `recommendedRemovalChars` · `packages/studio/src/lib/irToCarveNodes.test.ts`

---

## Phase 2: Foundational — the two engine facts the guard reads

**BLOCKS every user story.** FR-003's conjunction cannot be written until the IR can answer "is this store an
output target?" and "how many places produce this character?". Both are engine-side (NFR-004's real intent:
IR facts in the engine, policy in the studio). Both interface changes are **additive** — existing assertions must
pass unedited.

**Wave 1 — single task (every other foundational file imports the type it adds):**

- [X] **T004** Add `asIndexOutputTarget: boolean` to `StoreUsageFlags` and set it inside `analyzeStores`' existing single rule scan (the output loop already visits `outs()` and `index()` — no new pass); export the derived `StoreRole = "input" | "output" | "both" | "unused"` type · `packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [X] **T005** [P] New `buildProducerIndex(ir): ReadonlyMap<string, number>` — one pass over `ir.groups[].rules[]`, counting whole-rule producers plus **output**-store slots; excluding `any()`-consumed input slots, `isDeadkeyOnlyOutput` S-02 trigger rules, `notany()` slots, and opaque `RawKmnFragment`s (data-model §2, research §R4) · `packages/engine/src/pattern-apply/producerIndex.ts`
- [X] **T006** [P] Add the additive `storeSlots: { slotId: string; role: "input" | "output" }[]` field to `CharContributors`, tagged by the branch that added the slot (output role dominates a store reached by both); leave `storeSlotIds` contents, order, and every call site unchanged · `packages/engine/src/pattern-apply/collectCharContributors.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [X] **T007** [P] Export `buildProducerIndex`, `ProducerIndex`, and `StoreRole` from the engine barrels · `packages/engine/src/pattern-apply/index.ts`, `packages/engine/src/index.ts`
- [X] **T008** [P] Tests for `buildProducerIndex`: base-rule producer counted; output-store slot counted per matching slot; `any()`-only char **absent**; deadkey-trigger rule not counted; agreement with `collectCharContributors` on a keyboard with no input-store occurrences (data-model §2) · `packages/engine/src/pattern-apply/producerIndex.test.ts`
- [X] **T009** [P] Additive assertions for the new flag on the Cameroon grave-accent pair — `dkf0060` → `asIndexOutputTarget: false`, `dkt0060` → `true`, self-paired `word` → `both` with `coordinatedWith: []`; existing assertions unedited · `packages/engine/src/pattern-apply/applyStoreSlotRemovals.test.ts`
- [X] **T010** [P] Invariant D1 test — `storeSlots.map(s => s.slotId)` ≡ `storeSlotIds` element-for-element — plus role tagging for an input slot, an output slot, and a slot reached by both; existing assertions unedited · `packages/engine/src/pattern-apply/collectCharContributors.test.ts`

**Checkpoint**: the engine can answer both FR-003 questions; no studio behaviour has changed yet.

---

## Phase 3: User Story 1 — surplus produced character is proposed for trimming (P1)

**Goal**: `ɨ` is proposed on Cameroon QWERTY when the orthography excludes it; accepting splices the `i`/`ɨ` pair
and leaves `i` typeable via its own base rule.

**Independent Test**: [quickstart.md](quickstart.md) §1 — load Cameroon QWERTY, confirm an orthography without
`ɨ`, open carve; `ɨ` appears as a trim proposal; accept it; `ɨ` is gone from the produced set and `i` still
round-trips.

### Tests

**Wave 1 — single task:**

- [X] **T011** [US1] Failing tests G1/G2/G9 from [contracts/collateral-guard.md](contracts/collateral-guard.md): `ɨ` **is** in `recommendedRemovalChars` and its tile is flagged surplus; accepting splices `dkf#i` **and** `dkt#i` while `+ [K_I] > 'i'` is untouched; banner and tile signals agree (NFR-001) · `packages/studio/src/lib/irToCarveNodes.test.ts`

### Implementation

**⟶ Wait for the tests to be red, then:**

**Wave 2 — single task:**

- [X] **T012** [US1] Rewrite `coordinatedDropHitsNeededChar` as the FR-003 conjunction — needed **AND** partner is an output store (`asIndexOutputTarget`) **AND** `producerIndex.get(ch) ?? 0 <= 1`; widen its params from `storesByName` to the full `StoreAnalysis` plus a `ProducerIndex`, and hoist `buildProducerIndex(ir)` **once per IR** (invariant D4) in both `recommendedRemovalChars` and `annotateRemovalRecommendations`. Fix the predicate, never its call sites (NFR-001) · `packages/studio/src/lib/irToCarveNodes.ts`

**⟶ Wait for Wave 2 to finish (same file), then:**

**Wave 3 — single task:**

- [X] **T013** [US1] Add `role: "input" | "output"` and `isLost: boolean` (= `isNeeded && role === "output" && producerCount <= 1`) to `CoordinatedCollateralChar` in `coordinatedCollateralForSlots`, so the UI can split severity by partner role instead of by `isNeeded` alone · `packages/studio/src/lib/irToCarveNodes.ts`

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — single task:**

- [X] **T014** [US1] FR-005 collateral copy split: `isLost` → warning with `role="alert"` and confirm; `role === "input"` → informational with `role="status"` naming the transform that stops firing ("The `i` → `ɨ` deadkey combination will no longer fire."); drop the leading `⚠` emoji from both (Article VIII) · `packages/studio/src/editors/carve/CarveGallery.tsx`

**⟶ Wait for Wave 4 to finish, then:**

**Wave 5 — independent (different files):**

- [X] **T015** [P] [US1] Add the new/reworded `editor.carve.*` message ids and run `messages:extract`; fill `en`, leave `fr` for translation parity · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`
- [X] **T016** [P] [US1] Test G10 — input-partner collateral renders `role="status"`, carries no `⚠`, and uses no "character you need" wording · `packages/studio/src/editors/carve/CarveGallery.test.tsx`

**Checkpoint**: US1 is independently functional — the reported ɨ defect is fixed and demoable on Cameroon QWERTY.

---

## Phase 4: User Story 2 — a genuinely load-bearing needed character is still protected (P1)

**Goal**: the guard is narrowed, not removed. A trim that would leave a needed character unproducible still warns.

**Independent Test**: [quickstart.md](quickstart.md) §2 — the three truth-table fixtures (rows 3–5) plus the
unchanged shields.

### Tests

**Wave 1 — single task:**

- [X] **T017** [US2] Truth-table coverage G3–G8 from [contracts/collateral-guard.md](contracts/collateral-guard.md): needed `Y` produced **only** as an output partner → shields (row 5); `Y` also produced by a separate rule → no shield (row 4); input partner → no shield (row 3); self-paired `word` store unchanged (row 2); empty needed set → `[]` (FR-009); digit/punctuation/symbol still shielded by `isAlwaysKeepCategory`; opaque-fragment producer still shielded by the `blocked` check **before** the producer test · `packages/studio/src/lib/irToCarveNodes.test.ts`

### Implementation

**⟶ Wait for the tests to be red, then:**

**Wave 2 — independent (different files):**

- [X] **T018** [P] [US2] Reconcile any gap T017 exposes in shield **ordering** — surplus/always-keep, then `blocked`/no-contributors, then removability, and only then the coordinated-drop conjunction; keep FR-009's `needed.size === 0` early return first · `packages/studio/src/lib/irToCarveNodes.ts`
- [X] **T019** [P] [US2] FR-006 warn-and-confirm gate: an `isLost` collateral entry must block a silent apply — the author confirms explicitly or the trim does not apply · `packages/studio/src/editors/carve/CarveGallery.tsx`

**Checkpoint**: the narrowed guard is provably still protecting the real case; US1 + US2 ship together as the fix.

---

## Phase 5: User Story 3 — every acted-on trim is visibly reflected (P1)

**Goal**: no trim ever ends in "dialog closes, nothing visibly happens".

**Reproduction-first** ([research.md](research.md) §R5): gid/slot-id mismatch is largely ruled out. If the repro
shows the symptom disappears once Phase 3 lands, **record that outcome** rather than inventing a fix — this phase
then reduces to the two invariant tests.

**Independent Test**: [quickstart.md](quickstart.md) §3 — trim a proposed character and watch every tile for it
flip within the same render; attempt a genuinely blocked trim and see an explicit reason.

### Tests

**Wave 1 — single task (must run before any patch):**

- [X] **T020** [US3] Reproduce against the post-Phase-3 build: trim a character, record which tiles fail to flip, and decide between the two live candidates — (a) the symptom *was* US1 shielding, or (b) the `buildPendingCascade` plain-toggle fast path (`removableCount <= 1 && blocked.length === 0 && collateral.length === 0`) flipping only the clicked gid when a second producer was filtered as not-removable. Write the outcome into [research.md](research.md) §R5 and record it as a decision via `write-context.py --decision` · `specs/051-carve-orthography-trim/research.md`

**⟶ Wait for the reproduction outcome, then:**

### Implementation

**Wave 2 — independent (different files):**

- [X] **T021** [P] [US3] FR-007 invariant asserted over **rendered state**, not the store: after an applied trim, `{tiles rendered removed} ⊇ {ids in the trimmed contributor set}` within the same render, and `kept`/`total` update. Plus FR-008's three-outcome assertion — applied / applied-with-explicitly-retained-producers / refused-with-reason · `packages/studio/src/editors/carve/CarveGallery.test.tsx`
- [X] **T022** [P] [US3] FR-008 reason path: route every non-applying trim to an explicit reason — including the `buildPendingCascade` plain-toggle fast path, which must surface retained-but-not-removable producers instead of silently flipping one gid. Make "closes with no visible effect" unreachable · `packages/studio/src/editors/carve/CarveGallery.tsx`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — single task:**

- [X] **T023** [US3] Message ids for the FR-008 reasons (blocked store class, no removable producer, explicitly-retained producer); `messages:extract` · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**Checkpoint**: every trim the author acts on is visible or explained; the P1 slice (US1–US3) is complete and shippable.

---

## Phase 6: User Story 4 — cased letters are trimmed together as a pair (P2)

**Goal**: mapping adds both cases, removal removes both; a shared uppercase retires only when its last lowercase
referent is trimmed. Only meaningful once Phase 3 is correct.

**Independent Test**: [quickstart.md](quickstart.md) §4 — grounded folds (`ǝ`/`Ǝ`, `s`/`ſ`→`S`, `i`/`ı`→`I`), not
the spec's Latin-`a`/Greek-`α` example, which does not hold.

### Tests

**Wave 1 — single task:**

- [X] **T024** [US4] Failing tests P1–P11 from [contracts/case-pairing.md](contracts/case-pairing.md): pair-together both directions; null ⇒ single (`ß`, `ĸ`, `ǲ`, a combining mark, `ك`); `{ s, ſ, S }` retain-then-retire; `bcp47 = "tr"` splitting `{ i, ı, İ, I }` into two 1:1 groups; no-`bcp47` `{ i, ı, I }` sharing one `I`; uppercase absent from the produced set ⇒ `upper: null`; no local `toUpperCase()` anywhere in carve casing (FR-012) · `packages/studio/src/lib/carveCasePairs.test.ts`

### Implementation

**⟶ Wait for the tests to be red, then:**

**Wave 2 — single task:**

- [X] **T025** [US4] New `caseGroupFor(ch, produced, bcp47)` and `caseTrimSet(ch, produced, bcp47, alsoTrimming?)`, built **only** on the engine's `caseCounterpart` (no second casing path); uppercase modelled as a **reference set** scanned from the produced set, never an inverse of `toLowerCase()`; retire rule `lowers(upper) \ T = ∅` (data-model §4, FR-013) · `packages/studio/src/lib/carveCasePairs.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [X] **T026** [P] [US4] FR-014 — when both members of a case group are surplus, `recommendedRemovalChars` surfaces **one** paired proposal row, not two · `packages/studio/src/lib/irToCarveNodes.ts`
- [X] **T027** [P] [US4] FR-011/FR-015 — the cascade handlers resolve `caseTrimSet` → per-character `collectCharContributors` → union of trim units, handed to the **existing single** `cascadeDelete` call (one action, one undo entry; NFR-003 unchanged). A blocked member surfaces through the existing `blocked` path rather than dropping out · `packages/studio/src/editors/carve/CarveGallery.tsx`

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — independent (different files):**

- [X] **T028** [P] [US4] Gallery-level case tests: one paired row rendered; accepting trims both cases as one undo entry; declining leaves the per-chip cascade available to trim one case alone (the OQ-5 escape hatch) · `packages/studio/src/editors/carve/CarveGallery.test.tsx`
- [X] **T029** [P] [US4] Paired-row copy plus the one line making the OQ-5 escape hatch discoverable; `messages:extract` · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**Checkpoint**: carve's cased-letter handling matches the mechanism galleries; issue #1357 is fully addressed.

---

## Phase 7: Polish

**Wave 1 — independent (different files):**

- [X] **T030** [P] Fix the NFR-004 wording — the real invariant is that the **engine** must not import the studio, not the reverse (research.md "Open items") · `specs/051-carve-orthography-trim/spec.md`
- [X] **T031** [P] km-domain read of the FR-005 informational copy (OQ-2): confirm the phrasing reads correctly for AltGr fan-outs as well as deadkeys, where "combination" may be the wrong noun; reword the message value without touching code · `packages/studio/src/locales/en/messages.json`
- [X] **T032** [P] Confirm no `⚠` or other emoji survives in the carve collateral copy (Article VIII) · `packages/studio/src/editors/carve/CarveGallery.tsx`
- [X] **T033** [P] Update the feature docs to record the shipped shape — the §R5 reproduction outcome and the OQ-1…OQ-5 resolutions as built · `specs/051-carve-orthography-trim/research.md`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — single task:**

- [X] **T034** Gate run and Success-Criteria validation: `pnpm typecheck`, `pnpm -r test`, `pnpm lint` (includes `i18n-catalog-lint`, `content-i18n-lint`, `crew-lint`), then walk [quickstart.md](quickstart.md)'s "Done when" checklist end-to-end · repo root

---

## Dependencies & Execution Order

**Phase order**: Setup (T001–T003) → Foundational (T004–T010) → US1 (T011–T016) → US2 (T017–T019) → US3 (T020–T023) → US4 (T024–T029) → Polish (T030–T034).

- **Phase 1 (Setup)** — one wave, all three tasks independent. Must pass **before** any change; a failure invalidates research §R1.
- **Phase 2 (Foundational)** — W1 `T004` (defines `StoreRole` + the flag) blocks W2 `T005`/`T006`, which block W3 `T007`–`T010`. **Blocks every user story.**
- **Phase 3 (US1)** — W1 `T011` (red tests) → W2 `T012` (the guard) → W3 `T013` (same file, collateral shape) → W4 `T014` (UI copy) → W5 `T015`/`T016`.
- **Phase 4 (US2)** — W1 `T017` (red truth table) → W2 `T018`/`T019` (different files, independent). Depends on Phase 3's `T012`/`T013`.
- **Phase 5 (US3)** — W1 `T020` (reproduction, gates the rest) → W2 `T021`/`T022` (different files) → W3 `T023`. Depends on Phase 3 landing first.
- **Phase 6 (US4, P2)** — W1 `T024` (red) → W2 `T025` (the resolver) → W3 `T026`/`T027` (different files) → W4 `T028`/`T029`. Depends on a correct Phase 3.
- **Phase 7 (Polish)** — W1 four independent tasks → W2 `T034`, which must run last.

### Parallel Opportunities

- Phase 1's three tasks run together (contracts test, studio test, docs check).
- Phase 2 W2 (`T005` producer index, `T006` contributor roles) and W3 (`T007`–`T010`, four different files) are the widest fan-outs in the feature.
- Phase 4 W2, Phase 5 W2, Phase 6 W3 and W4, and Phase 7 W1 each pair studio-lib work with gallery/locale work in different files.
- **Never parallel**: anything two tasks share a file on — `irToCarveNodes.ts` (`T012`, `T013`, `T018`, `T026`), `CarveGallery.tsx` (`T014`, `T019`, `T022`, `T027`, `T032`), and the locale catalogs (`T015`, `T023`, `T029`, `T031`). Those are sequenced across waves deliberately.
