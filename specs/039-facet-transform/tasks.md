---
description: "Task list for Facet Transform Engine (spec 039)"
---

# Tasks: Facet Transform Engine

**Input**: Design documents from [specs/039-facet-transform/](.) — [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Prerequisites**: plan.md (tech stack + structure), spec.md (US1/US2/US3 + FR-001..FR-013 + SC-001..SC-006), data-model.md (5 entities), contracts/ (transition-matrix + transform-proposal), research.md (D1–D12)

**Tests**: INCLUDED — the feature explicitly requires fixture tests (spec Testing section, quickstart Scenarios 1–5, SC-001..SC-006). Test tasks are written to fail before the implementation that satisfies them.

**Organization**: Grouped by user story (P1/P2/P3) so each transform class ships as an independently testable increment. Engine-owned code lives in `packages/engine/src/facet-transform/`; studio wiring in `packages/studio/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish carry no story label)
- Every task names an exact file path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the engine module skeleton and wire it into the package, plus the shared test-fixture scaffold.

- [x] T001 Create the module directory and a placeholder curated barrel at `packages/engine/src/facet-transform/index.ts` (exports to be filled: `proposeFacetTransform`, `applyFacetTransform`, `TRANSITION_MATRIX`, types) per plan.md Project Structure.
- [x] T002 [P] Re-export the facet-transform barrel from `packages/engine/src/index.ts`, placed immediately after the `pattern-apply` export block (plan.md Structure Decision).
- [x] T003 [P] Create the fixture scaffold at `packages/engine/src/facet-transform/__fixtures__/measurements.ts` — a `SourceFacetMeasurement` builder (Entity 0 shape: `dominantValue`, `confidenceClass`, `consistency`, `exceptionSites[]` with `causeTag`, `evidenceSize`) used by every story's tests (quickstart Prerequisites, research D4). **D4 fixture-only guard**: the cause-tagged `source.*` exception-site schema (and `orth.display-difficulty`) are spec-037 outputs **not yet landed** — the engine is built and tested against these fixtures ONLY; do NOT wire it to live `docs/keyboard-facet-index.json` measurements until 037 ships the cause-tag schema.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The types, the owned transition matrix, the propose/refuse surface, and the shared commit gate — every user story depends on these.

**⚠️ CRITICAL**: No user-story transform can be implemented until this phase is complete.

- [x] T004 [P] Define the engine types in `packages/engine/src/facet-transform/types.ts` — `SourceFacetMeasurement` + `ExceptionSite` (Entity 0), `FacetTransition` (Entity 1), `MigrationRule` (Entity 2), `TransformProposal` + `AffectedSite` (Entity 3), `HouseTargetPolicyRow` + `HouseTargetResolution` (Entity 4), plus `TransformRefusal` and `CommitResult`. Include the D5 disclaimer comment (does NOT import/extend `StrategyId`/`PrimaryRuleNumber`/§7.2 tree).
- [x] T005 Implement the value-transition matrix in `packages/engine/src/facet-transform/transition-matrix.ts` — the v1 supported rows (4 pairs across 3 impact classes) AND every declined-with-reason row (permanent + deferred) from [contracts/transition-matrix.contract.md](contracts/transition-matrix.contract.md), keyed at the sub-profile level for `source.encoding` (data-model Sub-profile rule). Depends on T004.
- [x] T006 [P] Matrix invariant + drift-guard test in `packages/engine/src/facet-transform/transition-matrix.test.ts` — assert invariants 1–5 (every requestable pair has a row; `lossless ⇒ behavior-preserving`; row `transformImpactClass` equals the facet's declared class; gate facets produce no rows; `mixed` is a valid `fromValue`). MUST fail before T005 is complete. Depends on T004.
- [x] T007 Implement `proposeFacetTransform` skeleton + refusal paths in `packages/engine/src/facet-transform/propose.ts` — resolve the requested `(facetId, toValue|preset)` against the matrix; return a `TransformRefusal` (verbatim reason) for gate facets, `undetermined`/below-evidence-floor measurements, and declined-with-reason pairs; these never reach `proposed` (contracts transform-proposal §Engine surface, spec Edge Cases). Depends on T004, T005.
- [x] T008 Implement the `AffectedSite` disposition builder in `packages/engine/src/facet-transform/propose.ts` — map cause tags to `defaultDisposition` (principled-split⇒`preserve`, capacity-forced⇒`consolidate-offered`, gap-omission⇒`fix-offered`, none⇒`apply`) per FR-005 / transform-proposal §Cause-tag disposition. Depends on T007.
- [x] T009 Implement the shared commit gate + `applyFacetTransform` surface in `packages/engine/src/facet-transform/verify.ts` and the barrel — the `apply(ir, acceptedSiteIds[]) → candidateIr` (copy-return, partial-acceptance filter per data-model Commit rule) → `verify` dispatch by impact class → opaque-diff (FR-009, reuse I4 `{feature,count}` inventory) → one-shot undebounced `validateWithOracle`/`compile` (research D8/D9) → `{status:'committed', nextIr, producedSetChanged}` | `{status:'commit-failed', failure}`. Migration-rule bodies land per-story. Depends on T004, T007.
- [x] T010 [P] Implement the `fallThroughImpact` producer + `producedSetChanged` computation in `packages/engine/src/facet-transform/verify.ts` — `buildProducedSet(before) != buildProducedSet(candidate)` drives FR-011 `producedCharacterSetDelta` and the FR-013 re-derive flag. Depends on T009.

**Checkpoint**: Matrix, types, propose/refuse, and the gate exist — user stories can now implement their migration rules in parallel.

---

## Phase 3: User Story 1 - Behavior-preserving encoding normalization to house style (Priority: P1) 🎯 MVP

**Goal**: Normalize a mixed-encoding base to house style with byte-identical output and identical typing behaviour; reversible; provenance chip only when a non-default house target fires.

**Independent Test**: Run the encoding transform toward house style on a mixed-encoding fixture; assert (a) produced-output + behaviour unchanged (compile/simulate parity), (b) source now matches house-style per role, (c) reversible (`assertSemanticEquivalence`).

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [x] T011 [P] [US1] Parity + invertibility fixture test (SC-001) in `packages/engine/src/facet-transform/encoding-spelling.test.ts` — mixed-encoding fixture → `proposeFacetTransform` → `applyFacetTransform`; assert `buildProducedSet` unchanged, `simulate` output identical over `generateCorpus`, and `assertSemanticEquivalence(before, inverse(after)).equivalent === true` (US1 Independent Test, AC2/AC3).
- [x] T012 [P] [US1] House-target provenance test (US1 AC1) in `packages/engine/src/facet-transform/house-target-policy.test.ts` — assert the resolved `HouseTargetResolution` and that the provenance chip renders ONLY when `isDefault === false` (e.g. `U+`-kept for a poorly-displaying script). MUST fail before T013/T014.
- [x] T013 [P] [US1] Modifier-fold precondition test in `packages/engine/src/facet-transform/encoding-spelling.test.ts` — `named ↔ split` modifier fold is lossless only when the per-site precondition holds; sites failing it are refused per-site, never silently collapsed (contract `encoding-spelling` precondition).

### Implementation for User Story 1

- [x] T014 [US1] Implement the house-target decision-table resolver in `packages/engine/src/facet-transform/house-target-policy.ts` — ordered, first-match-wins over `HouseTargetPolicyRow[]` (inputs: `script`, `orth.display-difficulty`), returning a `HouseTargetResolution` with `matchedRowOrder`/`explanation`/`isDefault` (Entity 4, D5 pattern-only). **`orth.display-difficulty` is an injected fixture input (spec-037 output, not yet landed — see T003 D4 guard)**, never read from a live index here. Depends on T004.
- [x] T015 [US1] Implement the `encoding-spelling` migration in `packages/engine/src/facet-transform/migrations/encoding-spelling.ts` — `'a' ↔ U+0061` output/base/combining + within-kind char-ref + modifier fold with per-site precondition; copy-return; NEVER touches the match-kind axis (contract scope). Depends on T009, T014.
- [x] T016 [US1] Implement the behavior-preserving `verify` branch in `packages/engine/src/facet-transform/verify.ts` — `buildProducedSet` equality pre-check → compile+`simulate` finalOutput equality over `generateCorpus` → invertibility via `assertSemanticEquivalence` (D6/D7). Depends on T009, T015.
- [x] T017 [US1] Wire `previewKind: 'source-diff'` assembly (per-role before/after + `houseTargetProvenance`) into `packages/engine/src/facet-transform/propose.ts` for `preset: 'house-style'` requests. Depends on T007, T014.
- [x] T018 [US1] Studio wiring: add the facet-transform stage to `packages/studio/src/hooks/useWorkingCopyTransform.ts` (or the current working-copy transform pipeline) — call `applyFacetTransform`, and on `committed` write `setWorkingIR(nextIr)` (research D1/D2). Depends on T009.
- [x] T019 [US1] Studio proposal UI — the `source-diff` preview + explicit-confirm control in `packages/studio/src/components/facet-transform/` (per-role before/after, "behaviour unchanged" assurance, invertibility note, provenance chip when non-default). Depends on T017, T018.

**Checkpoint**: US1 is fully functional — the safest transform class sets the propose→preview→confirm→rewrite pattern (MVP).

---

## Phase 4: User Story 2 - UX-changing mechanism switch (longpress → flick) with exception preservation (Priority: P2)

**Goal**: Switch dominant touch longpress to flick; preserve principled-split sites by default (named); surface gap-omission as a fix; refuse over-budget keys per-site; output unchanged.

**Independent Test**: Run longpress→flick over a fixture with a known principled-split + gap; assert dominant switched, principled-split preserved unless opted in, gap offered, output unchanged.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [x] T020 [P] [US2] Exception-preservation + gap + per-site-refusal test (SC-004) in `packages/engine/src/facet-transform/longpress-to-flick.test.ts` — assert principled-split sites `defaultDisposition: preserve` (named, not converted), gap-omission `fix-offered`, subkey-count-over-budget keys refused per-site with a reason, and `simulate` OUTPUT identical after commit (quickstart Scenario 2, US2 AC1/AC2/AC3).
- [x] T021 [P] [US2] Partial-acceptance test (FR-012) in `packages/engine/src/facet-transform/longpress-to-flick.test.ts` — confirm dominant switch while leaving principled-split preserved; assert only the accepted subset is rewritten and the working copy stays consistent (data-model Commit rule).

### Implementation for User Story 2

- [x] T022 [US2] Implement the `longpress-to-flick` migration in `packages/engine/src/facet-transform/migrations/longpress-to-flick.ts` — rewrite `TouchKeyIR.sk` → `TouchKeyIR.flick` on `TouchLayoutIR` via `parseTouchLayout`/`emitTouchLayout`; set `TouchKeyProvenance` explicitly per rewritten key (never clobber hand-set — research D3); refuse over-flick-budget keys per-site with a reason (contract Bound). Depends on T009.
- [x] T023 [US2] Implement derived flick-direction assignment (position-order → nearest available compass direction) surfaced as `derivedParameterReview` in `packages/engine/src/facet-transform/migrations/longpress-to-flick.ts`; derivation is NOT authoritative (spec Assumption). Depends on T022.
- [x] T024 [US2] Implement the ux-changing `verify` branch in `packages/engine/src/facet-transform/verify.ts` — produced OUTPUT unchanged via compile+`simulate` (only input UX changes); assemble the UX description. Depends on T009, T022.
- [x] T025 [US2] Wire `previewKind: 'ux-description'` assembly (every `namedLoss`, the derived-direction table, per-site refusals, preserved/offered sites with reasons) into `packages/engine/src/facet-transform/propose.ts`. Depends on T007, T023.
- [x] T026 [US2] Studio UI: `ux-description` preview + the derived-flick-direction review sub-step + per-site disposition controls in `packages/studio/src/components/facet-transform/`. **Article IV / D9 caution**: if the flick-direction override field re-validates a live preview on keystroke, it MUST reuse `useDebounce`/`useValidator` — never a bespoke `setTimeout` (no second debounce timer). Depends on T019, T025.

**Checkpoint**: US1 AND US2 both work independently — the cause-tag-aware, lossy-direction transform is covered.

---

## Phase 5: User Story 3 - Output-changing normalization migration (NFD → NFC) with coordinated rule rewrite (Priority: P3)

**Goal**: Migrate emitted output NFD→NFC and rewrite the matching backspace rules together; show an output-level diff and require explicit confirmation.

**Independent Test**: Run NFD→NFC on a fixture with backspace overrides; assert output normalization changed, backspace rules rewritten consistently, output diff shown before commit.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [x] T027 [P] [US3] Output-diff + companion backspace-rewrite test (US3 AC1/AC2) in `packages/engine/src/facet-transform/nfd-to-nfc.test.ts` — assert `previewKind: 'output-diff'` shows emitted-byte changes AND the now-unreachable two-codepoint backspace override removal; single backspace deletes the composed codepoint; explicit confirmation required; still compiles (quickstart Scenario 3, SC-006).

### Implementation for User Story 3

- [x] T028 [US3] Implement the `nfd-to-nfc` migration in `packages/engine/src/facet-transform/migrations/nfd-to-nfc.ts` — compose base+combining RHS → precomposed codepoints; copy-return (contract scope). Depends on T009.
- [x] T029 [US3] Implement the companion backspace-rule rewrite (FR-008) in `packages/engine/src/facet-transform/migrations/nfd-to-nfc.ts` — detect + remove the now-unreachable `'a' U+0301 + [K_BKSP] > nul` override (Check #11-adjacent unreachable-rule removal, not synthesis). Depends on T028.
- [x] T030 [US3] Implement the output-changing `verify` branch + `previewKind: 'output-diff'` assembly in `packages/engine/src/facet-transform/verify.ts` and `propose.ts` — produce the emitted-byte diff, list companion rewrites, require explicit confirm; not parity-checked but must not break compile. Depends on T009, T029.
- [x] T031 [US3] Studio UI: `output-diff` preview (byte-level diff + companion-rewrite list) + explicit-confirmation gate in `packages/studio/src/components/facet-transform/`. Depends on T026, T030.

**Checkpoint**: All three transform classes are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The honest-decline path, the compile-regression/opaque guards, the produced-set re-derivation, and docs — cross-cutting across all stories.

- [x] T032 [P] Honest-decline + refusal test (FR-004, quickstart Scenario 4) in `packages/engine/src/facet-transform/decline.test.ts` — gate refusal (`source.mnemonic-vs-positional`, `source.casing`), permanent decline (`input-match-kind`, `os-compose`), deferred decline (`nfc → nfd`), and `undetermined` measurement; assert each returns a `TransformRefusal` with a verbatim reason, none reaches `proposed`, none mutates the working copy.
- [x] T033 [P] Compile-regression + opaque-integrity test (SC-005/SC-006, quickstart Scenario 5) in `packages/engine/src/facet-transform/gate.test.ts` — a compile-breaking fixture ⇒ `status: 'commit-failed'`, working copy unchanged, failure attributed; a `RawKmnFragment` fixture ⇒ no fragment dropped/altered, `opaqueUntouched` reports the un-modellable region.
- [x] T034 [US3] FR-013 produced-set re-derivation studio-store test in `packages/studio/src/hooks/useWorkingCopyTransform.test.ts` (or the store test) — a committed transform that changes the produced-character set re-seeds discovery axes (`seedIrAxesFromBaseIr` → `setIrAxes`) so strategy/gallery re-derive (research D11).
- [x] T035 [P] Studio re-seed wiring in `packages/studio/src/hooks/useWorkingCopyTransform.ts` — on `committed` with `producedSetChanged`, invoke the axis re-seed (FR-013). Depends on T010, T018.
- [x] T036 [P] Update `docs/keyboard-index.md` with a row for every newly-cited fixture keyboard used in the tests (mandatory phonebook rule — read each keyboard's `.kps` for name/BCP47/author).
- [x] T038 [P] No-silent-transform structural test (SC-002) in `packages/engine/src/facet-transform/gate.test.ts` — assert there is NO code path from a transform request to `committed` that bypasses a `TransformProposal` + explicit confirmation, verified across all three impact classes (contract transform-proposal §Invariants SC-002).
- [x] T039 [P] Preview-completeness + fall-through structural test (SC-003, FR-011) in `packages/engine/src/facet-transform/preview.test.ts` — assert each `previewKind` surfaces every `namedLoss`, every companion rewrite, and `opaqueUntouched`; and assert `fallThroughImpact.producedCharacterSetDelta` is populated whenever `producedSetChanged` (FR-011 is v1 scaffolding — no supported v1 transition (un)blocks fall-through since `source.fallback-posture` is deferred per research D10, so this test drives the delta path via a synthetic produced-set-changing fixture).
- [x] T037 Run the quickstart validation — `pnpm --filter @keyboard-studio/engine test src/facet-transform` (Scenarios 1–5 green) + `pnpm typecheck` + `pnpm lint`; confirm all five quickstart scenarios pass (quickstart "What 'done' looks like"). **Run last** — after T038/T039.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**.
- **User Stories (Phase 3–5)**: all depend on Foundational. Independent of each other; can run in parallel (if staffed) or in priority order P1 → P2 → P3.
- **Polish (Phase 6)**: depends on the stories whose behaviour it exercises (T034/T035 depend on US1 wiring + T010; T032/T033/T038 depend on the gate; T032 depends on the matrix; T039 depends on the gate + `fallThroughImpact` from T010). T037 validation runs after all others.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories (MVP).
- **US2 (P2)**: after Foundational. Studio UI (T026) builds on the US1 proposal shell (T019) but the engine migration is independent.
- **US3 (P3)**: after Foundational. Studio UI (T031) builds on the US2 shell (T026) but the engine migration is independent.

### Within Each User Story

- Tests are written FIRST and must FAIL before implementation (spec Testing).
- Migration rule → impact-class `verify` branch → `previewKind` assembly → studio wiring.

### Parallel Opportunities

- Setup: T002, T003 in parallel (T001 first).
- Foundational: T004 and T006 in parallel; T010 after T009.
- US1 tests T011/T012/T013 in parallel; US2 tests T020/T021 in parallel.
- Once Foundational is done, US1/US2/US3 engine migrations can proceed in parallel by different developers (different files under `migrations/`).
- Polish: T032/T033/T035/T036/T038/T039 in parallel; T037 (validation) runs last.

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (write-first, expect FAIL):
Task: "Parity + invertibility fixture test in packages/engine/src/facet-transform/encoding-spelling.test.ts"
Task: "House-target provenance test in packages/engine/src/facet-transform/house-target-policy.test.ts"
Task: "Modifier-fold precondition test in packages/engine/src/facet-transform/encoding-spelling.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL — blocks all stories).
2. Phase 3 US1 (behavior-preserving encoding normalization).
3. **STOP and VALIDATE**: run Scenario 1 — parity + invertibility + provenance chip.
4. Demo the propose→preview→confirm→rewrite pattern on the safest class.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate → demo (MVP: behavior-preserving).
3. US2 → validate → demo (ux-changing, cause-tag preservation).
4. US3 → validate → demo (output-changing, coordinated migration).
5. Polish: declines, gate guards, FR-013 re-derivation, docs, quickstart.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Engine code is copy-return (never in-place) per the `carveFilterIr` precedent; the studio does all `setWorkingIR` writes (Article VI — engine stays free of studio state).
- The pre-commit gate is a ONE-SHOT undebounced `validateWithOracle`/`compile` call — do NOT add a second timer (Article IV, research D9).
- Gate facets (`source.mnemonic-vs-positional`, `source.casing`) are refused upstream — they never produce a matrix row.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
