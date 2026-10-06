# Tasks: En-Masse Adaptation Preference Questions

**Feature**: 038-adaptation-questions | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

**Design inputs**: [research.md](research.md) (7 decisions), [data-model.md](data-model.md) (5 entities + FR-008 wiring), [contracts/question-catalog.contract.md](contracts/question-catalog.contract.md) (record + C1–C8 lint), [contracts/adaptation-engine.contract.md](contracts/adaptation-engine.contract.md) (firing / posture / policy / events).

**Line format**: `- [x] **T###** [P?] [US#] Description · path`. `[P]` = independent of the others in its wave (different file, no incomplete dependency). `[US#]` = the user story it serves.

**Team boundary (Article VI)**: **Content** owns `content/adaptation-questions/**`, the survey question modules, flow wiring, and facet-record `consumers` updates. **Engine** owns `packages/studio/src/adaptation/**`, the firing evaluator, posture step, evidence seam, and event recorder.

---

## Phase 1: Setup — catalog directory + lint tooling

**Wave 1 — independent (different files):**

- [x] **T001** [P] Create `content/adaptation-questions/` with a `README.md` documenting the Question-record schema (id, family, elicits, firingCondition, prefill, provenanceLabel, consumers, noEvidenceDegradation, scope, renders, status) per [data-model.md](data-model.md) Entity 1 · content/adaptation-questions/README.md
- [x] **T002** [P] Scaffold the engine adaptation module with a barrel export (empty surfaces filled in Phase 2) · packages/studio/src/adaptation/index.ts

**⟶ Wait for Wave 1, then:**

- [x] **T003** Implement `adaptation-catalog-lint` (checks C1 schema, C2 id/path, C3 no-always, C4 required policy fields, C5 real prefill facets, C6 renders↔module, C7 family floor ≥3, C8 consumers form) and wire it into `pnpm lint` after `facet-lint`; must stay green against an empty/partial catalog · utilities/adaptation-catalog-lint/index.js, package.json

---

## Phase 2: Foundational — engine seam, policy, event writer, firing core

**BLOCKS all user stories.** No US work begins until this phase is done.

**Wave 1 — independent (different files):**

- [x] **T004** [P] `AdaptationEvidence` seam + provider interface (targetScript, baseScriptDistribution, siblingScriptSpread, latinSubProfile, strategyFingerprint, baseTargetMix, statedDeviceMix, provenanceTier) per [contracts/adaptation-engine.contract.md](contracts/adaptation-engine.contract.md) §1 · packages/studio/src/adaptation/evidence.ts
- [x] **T005** [P] `TrustPolicy` interface + defaults (singleScriptThreshold 0.80, allowFallbackTierPrefill true, orthographyJoins [], scope) per contract §3 · packages/studio/src/adaptation/trustPolicy.ts
- [x] **T006** [P] `ConfirmationEvent` type + single `recordConfirmation(...)` writer stamping `at`, appending to session store in harness-readable shape (FR-007) per contract §4 · packages/studio/src/adaptation/confirmationEvents.ts
- [x] **T007** [P] Catalog loader — parse `content/adaptation-questions/*.yaml` into typed Question records for the evaluator · packages/studio/src/adaptation/catalog.ts

**⟶ Wait for Wave 1, then:**

- [x] **T008** `evaluateFiringConditions(evidence, policy) → FiredQuestion[]` core: pure/deterministic, reads catalog + policy, returns only questions whose firingCondition holds, honors `singleScriptThreshold`/`allowFallbackTierPrefill` (fallback-disallowed ⇒ `prefilledValue: null`, never a silent drop) per contract §1 · packages/studio/src/adaptation/firing.ts

- [x] **T009** Unit test: `recordConfirmation` writes exactly one event per resolution, preserves `provenanceTier`, no aggregation (FR-007 / SC-006) · packages/studio/src/adaptation/confirmationEvents.test.ts

---

## Phase 3: US1 — Script alignment confirmations (Priority: P1) 🎯 MVP

**Goal**: Carry base/target/sibling script signals forward as §3c confirmations that fire only when evidence is less than clean.
**Independent Test**: With a mocked index, walk onboarding for a language whose siblings exist in Arab and Latn; the script-spread question appears with corpus counts, the answer updates the working target, and a clean single-script case asks nothing extra.

### Tests

- [x] **T010** [US1] Failing test (mocked index): multi-script siblings fire `q_sa1` with corpus-count evidence; dominant-script disagreement / "mixed" base fires `q_sa2`; Latin subprofile disagreement fires `q_sa3`; all-signals-agree fires **nothing** (SC-002) · packages/studio/src/adaptation/firing.us1.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T011** [P] [US1] `q_sa1_target_script_spread` record (fires `sibling-script-spread > 1`, ask-plainly, session, renders:true) · content/adaptation-questions/q_sa1_target_script_spread.yaml
- [x] **T012** [P] [US1] `q_sa2_base_script_mismatch` record (`dominant-script-disagreement OR base-script == mixed`, ask-plainly, session) · content/adaptation-questions/q_sa2_base_script_mismatch.yaml
- [x] **T013** [P] [US1] `q_sa3_latin_flavor` record (`target == Latn AND latin-subprofile-disagreement`, ask-plainly, session) · content/adaptation-questions/q_sa3_latin_flavor.yaml
- [x] **T014** [P] [US1] Update facet `consumers` for the US1 prefill sources (FR-008) · content/facets/community/multi-orthography.yaml, content/facets/lineage/siblings.yaml, content/facets/lineage/nearest-neighbors.yaml, content/facets/orth/regional-variant.yaml

**⟶ Wait for Wave 1, then:**

**Wave 2 — independent (different files):**

- [x] **T015** [P] [US1] Survey modules for `q_sa1`/`q_sa2`/`q_sa3` (definition + validate + fixtures), landed as **reserve modules** — resolved by lint but deliberately **not** registered in `registry.b.ts` nor listed in the Phase B flow, to preserve the SC-002/SC-003 non-interruption bar (a clean single-script walk must add zero questions). See the "Reserve-module decision" note below. · packages/studio/src/survey/questions/b/q_sa1_target_script_spread.ts, .../q_sa2_base_script_mismatch.ts, .../q_sa3_latin_flavor.ts
- [x] **T016** [P] [US1] Extend `Prefill.tsx` with script-alignment confirmation rows (§3c: value + provenance chip naming the corpus evidence + tier) · packages/studio/src/survey/Prefill.tsx

**⟶ Wait for Wave 2, then:**

- [x] **T017** [US1] Implement the US1 firing predicates (`sibling-script-spread`, `dominant-script-disagreement`/mixed, `latin-subprofile-disagreement`) in the evaluator so **T010** passes; wire prefills through Prefill rows · packages/studio/src/adaptation/firing.ts

**Checkpoint**: US1 is independently functional — a mocked dual-script walk surfaces ≤2 script-alignment questions with provenance; a clean single-script walk surfaces zero. (SC-002, SC-003)

---

## Phase 4: US2 — Inheritance posture (Priority: P2)

**Goal**: One per-facet keep/propose/discard answer set governs many downstream proposals; the en-masse lever.
**Independent Test**: Set posture "keep base's input strategies, retarget devices" on a mocked session; later proposal sites receive the posture (strategy proposals constrained to the fingerprint; device targets opened), each still §3c-editable.

### Tests

- [x] **T018** [US2] Failing test: `buildPosture` yields all-`default` on skip (never blank, US2 sc.4); one posture entry governs ≥3 proposal sites (SC-004); an individual override is **local** and does not rewrite the `PostureEntry` (FR-005); base switch resets only changed-evidence entries · packages/studio/src/adaptation/posture.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T019** [P] [US2] `q_ip1_keep_strategies` record (`base-has-strategy-fingerprint`, record-no-default, session) · content/adaptation-questions/q_ip1_keep_strategies.yaml
- [x] **T020** [P] [US2] `q_ip2_keep_device_targets` record (`base-target-mix != stated-device-mix`, ask-plainly, session) · content/adaptation-questions/q_ip2_keep_device_targets.yaml
- [x] **T021** [P] [US2] `q_ip3_keep_script_conventions` record (`base-neutral-residue-has-script-variants`, record-no-default, session) · content/adaptation-questions/q_ip3_keep_script_conventions.yaml
- [x] **T022** [P] [US2] Update facet `consumers` for the US2 prefill sources (FR-008) · content/facets/lineage/strategy-fingerprint.yaml, content/facets/env/device-mix.yaml, content/facets/community/input-conventions.yaml

**⟶ Wait for Wave 1, then:**

- [x] **T023** [US2] `buildPosture(evidence, baseId)` + `postureFor(posture, facet)` (pure builder mirroring `buildPrefillRows`); skip ⇒ all-`default`; en-masse read for FR-005 · packages/studio/src/adaptation/posture.ts

**⟶ Wait for T023, then:**

**Wave 3 — independent (different files):**

- [x] **T024** [P] [US2] `InheritancePostureStep.tsx` — renders entries as §3c keep/propose/discard radios + provenance chips (Prefill component pattern) · packages/studio/src/adaptation/InheritancePostureStep.tsx
- [x] **T025** [P] [US2] Survey modules for `q_ip1`/`q_ip2`/`q_ip3` landed as **reserve modules** (see the note below); the inheritance-posture surface ships as the standalone `InheritancePostureStep.tsx` (T024) rather than a flow-registered Phase B step, so it renders only when a base carries adaptable facets. · packages/studio/src/survey/questions/b/q_ip1_keep_strategies.ts, .../q_ip2_keep_device_targets.ts, .../q_ip3_keep_script_conventions.ts

**⟶ Wait for Wave 3, then:**

- [x] **T026** [US2] Wire `recordConfirmation` into the posture step; enforce override-is-local (posture entry untouched, proposal chip reflects the override) so **T018** passes · packages/studio/src/adaptation/InheritancePostureStep.tsx

**Checkpoint**: US2 is independently functional — one posture answer demonstrably governs ≥3 downstream sites in a mocked session, overrides stay local. (SC-004)

---

## Phase 5: US3 — Trust and threshold policies (Priority: P3)

**Goal**: Make the trust dial user-visible — confidence threshold, fallback-tier prefill permission, named-orthography opt-in join.
**Independent Test**: Lower the threshold in a mocked session → a previously-"mixed" base prefills single-script with the policy named in its chip; raise it → the same base routes to a US1 confirmation.

### Tests

- [x] **T027** [US3] Failing test: lowering `singleScriptThreshold` reclassifies mixed→single-script with the policy named in provenance; raising routes to a US1 confirmation; fallback-tier prefills stay visually distinguishable (FR-006); resolution recorded via `recordConfirmation` (SC-006) · packages/studio/src/adaptation/trustPolicy.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T028** [P] [US3] `q_tp1_confidence_threshold` record (`workflow-defaults-being-configured`, ask-plainly, **workflow**, no facet prefill) · content/adaptation-questions/q_tp1_confidence_threshold.yaml
- [x] **T029** [P] [US3] `q_tp2_fallback_tier_prefill` record (`any-base-classified-at-fallback-tier`, ask-plainly, **workflow**) · content/adaptation-questions/q_tp2_fallback_tier_prefill.yaml
- [x] **T030** [P] [US3] `q_tp3_orthography_join` record — session-scoped opt-in join, the ONLY path a named orthography label enters (FR-009), record-no-default · content/adaptation-questions/q_tp3_orthography_join.yaml
- [x] **T031** [P] [US3] Add Q-TP3 to `community/multi-orthography` facet `consumers` (FR-008) · content/facets/community/multi-orthography.yaml

**⟶ Wait for Wave 1, then:**

**Wave 2 — independent (different files):**

- [x] **T032** [P] [US3] Trust-policy dials (q_tp1/q_tp2 workflow-scoped, q_tp3 session opt-in) landed as **reserve modules** (see the note below); the live dials are exercised through `resolveTrustPolicy` + scope persistence (T033) rather than a flow-registered workflow-defaults step. · packages/studio/src/survey/questions/b/q_tp1_confidence_threshold.ts, .../q_tp2_fallback_tier_prefill.ts, .../q_tp3_orthography_join.ts
- [x] **T033** [P] [US3] Implement TrustPolicy scope persistence — workflow-scoped via session store keyed by workflow id, degrading to session scope where none exists (Decision 6) · packages/studio/src/adaptation/trustPolicy.ts

**⟶ Wait for Wave 2, then:**

- [x] **T034** [US3] Wire policy into the evaluator: threshold/fallback flags govern firing + prefill eligibility; fallback-tier prefills carry a distinguishing tier (FR-006); record threshold/policy resolutions via `recordConfirmation` so **T027** passes · packages/studio/src/adaptation/firing.ts

**Checkpoint**: US3 is independently functional — the trust dial visibly changes prefill/routing and every resolution is recorded.

---

## Phase 6: Polish — cross-cutting validation

**Wave 1 — independent (different files):**

- [x] **T035** [P] Mocked-index walkthrough test exercising the full flow: clean single-script (zero interruptions, all chips present), dual-script (≤2 SA questions), posture governing ≥3 sites, no-evidence degradation for every question, event capture for 100% of fired questions (SC-002–SC-006) · packages/studio/src/adaptation/walkthrough.test.tsx
- [x] **T036** [P] Confirm `pnpm lint` green — catalog lint C1–C8 pass and `facet-lint` coverage stays honest with all 9 records + facet consumers wired (SC-001) · (run `pnpm lint`)
- [x] **T037** [P] Finalize `content/adaptation-questions/README.md` (catalog inventory + lifecycle note) and cross-link from the facets README · content/adaptation-questions/README.md, content/facets/README.md

**⟶ Wait for Wave 1, then:**

- [x] **T038** Validate the shipped feature against Success Criteria SC-001–SC-006 and tick the feature checklist · specs/038-adaptation-questions/checklists/

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 US1 (P1)** → **Phase 4 US2 (P2)** → **Phase 5 US3 (P3)** → **Phase 6 (Polish)**. Stories are ordered by priority; US1 is the MVP slice and is independently shippable at its checkpoint.
- **Phase 1**: Wave 1 (T001, T002) ∥ → T003 (lint) depends on the record schema.
- **Phase 2** blocks every story. Wave 1 (T004, T005, T006, T007) ∥ → T008 (firing core) needs evidence + policy + loader; T009 needs T006.
- **Phase 3 (US1)**: T010 first (red). Wave 1 records+facets (T011–T014) ∥ → Wave 2 modules+Prefill (T015, T016) ∥ → T017 makes T010 green (edits shared `firing.ts`).
- **Phase 4 (US2)**: T018 (red) → Wave 1 records+facets (T019–T022) ∥ → T023 (posture) → Wave 3 step+modules (T024, T025) ∥ → T026 (edits `InheritancePostureStep.tsx`, makes T018 green).
- **Phase 5 (US3)**: T027 (red) → Wave 1 records+facet (T028–T031) ∥ → Wave 2 dials+persistence (T032, T033) ∥ → T034 (edits shared `firing.ts`, makes T027 green).
- **Phase 6**: T035–T037 ∥ → T038.

**Shared-file serialization**: `firing.ts` (T008→T017→T034) and `content/facets/community/multi-orthography.yaml` (T014→T031) are each edited across phases — those edits are sequential by phase order, never parallel. (The originally-planned `registry.b.ts` / `content/flows/phase_b_characters.modular.yaml` serialization no longer applies — see the reserve-module decision below; neither file is touched by this feature.)

---

## Reserve-module decision (T015 / T025 / T032)

The 9 survey question modules under `packages/studio/src/survey/questions/b/` ship as **reserve modules**: fully-authored `FlowQuestion` definitions with mirror tests, resolved by the survey lint, but **deliberately not registered in `registry.b.ts` and not listed in `content/flows/phase_b_characters.modular.yaml`.**

Why the pivot from the original "register + flow-order" plan (Decision 2 in [research.md](research.md), and the T015/T025/T032 task text as first written): flow-registering these questions would inject them into the Phase B walk unconditionally, which **breaks the SC-002/SC-003 non-interruption bar** — a clean single-script adaptation walk must add *zero* questions, and confident agreement must surface a pre-confirmed chip rather than a prompt. The adaptation surfaces are therefore driven by:

- **US1 (script-alignment):** the pure firing evaluator (`firing.ts`) + the §3c confirmation rows in `Prefill.tsx` — questions appear only when a firing condition holds.
- **US2 (inheritance-posture):** the standalone `InheritancePostureStep.tsx`, rendered only when the base carries adaptable facets.
- **US3 (trust-policy):** `resolveTrustPolicy` + scope persistence (`trustPolicy.ts`); the dials are honest defaults unless the author opens the step.

The reserve modules are kept (not deleted) as the authored source of the question copy for these surfaces and as the registration point if a future feature wires them into the flow. Their copy is intentionally single-sourced against the runtime labels those surfaces render; keep them in sync when either changes.
