# Feature Specification: Library demote — demote the orphaned non-identity Phase A to reserve/library under the no-delete guardrail

> ## Amendment (2026-06-29, approved by Matt; confirmed by km-verification + km-domain)
>
> **The `pb_*` step-by-step battery is REMOVED from library-demotion scope.** During
> implementation (km-programmer) it was found — and two independent reviewers confirmed —
> that the original FR-002 ("`pb_*` stays **reachable** via the mandatory IntroChooser
> gate") is in **internal contradiction** with FR-003/FR-009 ("`pb_*` renders as a
> **reserve** node") against the **landed** spec-015/016 model. In that model "reserve"
> is defined as `registry − reachable` (`computeReserveNodes`: `reserveIds = registryKeys
> − liveIds`, where `liveIds` is exactly a flow YAML's question membership, which is also
> what makes a module gate-reachable and what the live `PhaseB.tsx` `makeManualOnlyFlow`
> path reads). A module that is reachable via the gate is therefore **by definition NOT
> reserve** — the two requirements cannot both hold. Empirically, removing the `pb_*`
> battery from `phase_b_characters.modular.yaml` turns **both** the protected
> `dashboard/buildStepGraph.test.ts` (`danglingTargets === []`) **and** the spec-016
> `dashboard/driftGuardrail.test.ts` bijection **RED**, and breaks the live manual path.
>
> **Resolution (this amendment):** the `pb_*` battery stays a **live, reachable,
> non-default branch** off the IntroChooser gate — it is **NOT library content** in
> Phase 1. Any "off the default spine" re-ordering of `pb_*` is **DEFERRED to the Phase-2
> per-element loop** (see non-goals / FR-011, D1). FR-002 is struck; the `pb_*` parts of
> FR-003/FR-009 are struck. **Kept in scope:** demote the already-orphaned **full
> non-identity Phase A** (15 identity + 15 `provenance_*`) to library/reserve; the
> no-delete CI guardrail (FR-005); the §7.5 strategy-axis regression lock
> (FR-006/FR-007); the `orthographyUrl` retention (FR-008); and spec-015/016 guardrails
> stay green **unmodified** (FR-009/FR-010).
>
> **Implementation note (LANDED — was open item I-2, now resolved):** the Phase-A
> demotion mechanism is to drop `phase_a_identity.modular.yaml` from the active
> flow-source set (`renderedNodeSet.ts` `FLOW_SOURCES`) so its 30 modules become
> registry-only reserve (`kind:"library-not-in-flow"`) via `computeReserveNodes` in the
> identity-lite drill-down. This collided with spec-017's prefill drill-down, whose
> `registryKey` was `primary_script` — itself a vestigial Phase-A module held in the
> flow ONLY to satisfy 017's anchor. **Resolution (Matt-approved, landed):** re-anchor
> 017's prefill drill-down to the **live** identity-lite equivalent `il_target_script`
> (the script-capture question on the real StudioShell→IdentityLite path —
> `questions/a/il_target_script.ts`; the live functional replacement for the demoted
> `primary_script`), then drop `phase_a_identity` from `FLOW_SOURCES`. `prefill.test.ts`
> FR-014 §2.2(b) is updated to assert the live `il_target_script` anchor is reachable
> AND that `primary_script` is now unreachable (demotion proven). The header.bcp47 input
> stays C5-satisfiable via the `charactersStep` subsumption write (DEC-D1), unchanged.
> `orthographyUrl` retention (FR-008) is wired into the live `extractIdentityLite`
> (`IdentityLite.tsx`), reusing the existing `answerString` helper and the existing
> `provenance.orthographyUrl` field (no contracts bump). **FR-001 and FR-008 are MET.**

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready for planning** — Phase 1, spec #8 (the final Phase-1 spec) of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §5). A demotion (not deletion) of off-default batteries into the inert library, rendered as reserve nodes via `computeReserveNodes`, backed by a no-delete CI assertion. No contracts bump, no new write routing, default-path behavior byte-identical.

**Input**: Spec #8 (`qu-library-demote`) of [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) (§2.1 orphaned-Phase-A decision item; §2.3 library demotions + strategy-axis impact + non-Latin precondition + Phase-A provenance caveat; §4 no-delete library guardrail; §5 spec #8; §6 decision 3 (RESOLVED — demote Phase A); findings (a)/(b)). Demote the rarely-taken `pb_*` step-by-step battery (55 modules, `content/flows/phase_b_characters.modular.yaml`) **off the default spine** — kept reachable via the mandatory IntroChooser discovery-method gate — and demote the orphaned full non-identity Phase A (15 identity + 15 `provenance_*`, `content/flows/phase_a_identity.modular.yaml`) into the **inert library**, rendered as reserve nodes via `computeReserveNodes` (`dashboard/buildStepGraph.ts:150-182`) on the `buildModularFlowGraph` registry-vs-YAML diff path. Demotion is **not deletion** (no-delete guardrail, §4): modules stay registered in their sub-registries, on disk, test-covered, and revivable; a CI assertion enforces preserved registry membership.

**Governing scope**: This feature implements **Phase 1 spec #8** of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.3 "Library demotions (under the no-delete guardrail)", §4 "No-delete library guardrail", §5 spec #8). It does **not** re-derive that scope. The companion research is recorded in [docs/design-notes/question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (findings (a): the maturity inversion — "the map advertises orphaned/low-maturity paths and hides the mature live ones" — and the vestigial `computeReserveNodes` machinery "currently empty (every registered module is listed in some YAML)"; findings (b): full Phase A "orphaned … Demote to library (Q3)" and the `pb_*` battery "Keep reachable via discovery gate; demote off default spine → library where off-branch"). It depends on the map projection (spec 015 — reserve nodes render through the modular path), the drift guardrail (spec 016 — the rendered ⟺ runtime bijection must stay green; demoted-but-registered modules are *reserve*, not *orphan*), and the build-list wiring (spec 020 — the build-list branch is the default path off the same IntroChooser gate whose strategy output must stay unchanged).

> **The orphaned-Phase-A disposition is RESOLVED (Matt, 2026-06-29).** Migration-plan §6 decision 3: **DEMOTE to the inert library** ("demote the orphaned Phase A. We'll re-use some of that later") — `identity_lite` is the canonical identity experience. Demote, **not** delete: modules stay registered, on disk, and test-covered per the no-delete guardrail (§4), explicitly flagged for later reuse; retain `orthographyUrl` capture in `identity_lite` / the documentation stage. The **revival alternative — wiring `PhaseA` back into `StudioShell` (`StudioShell.tsx:18`) — is rejected** by that decision. There is therefore **no `[NEEDS DECISION]` on the demote-vs-revive question**; the open items below are domain preconditions and a deferred Phase-2 axis decision, not blockers.

> **Note on technical content in this spec (deliberate).** Per repository convention — where `packages/studio/src/survey/questions/registry.ts` (+ the `registry.a.ts` / `registry.b.ts` / `registry.f.ts` sub-registries), the `content/flows/*.modular.yaml` flow sources, and the `packages/studio/src/dashboard/` graph-model types (`computeReserveNodes` / `buildModularFlowGraph`) are architectural contracts and the extracted `specs/NNN/` folders carry real material — the non-obvious constraints (the off-default-spine demotion of `pb_*` while keeping it reachable via the IntroChooser gate, the library demotion of the full Phase A, the `computeReserveNodes` reserve-node rendering, the no-delete registry-membership CI assertion, the `selectStrategy`-output-unchanged strategy-axis acceptance against the §7.5 exemplars, and the retained `orthographyUrl` capture) are specified here as Functional Requirements and Success Criteria. The *mechanics* (the exact YAML edits, the precise CI-assertion harness, the §7.5 exemplar fixture) remain plan-level.

## Phase-1 invariants (thread through every requirement)

- **No new write routing.** This spec introduces no IR write path and no `mutate()`. Demotion is a *flow-membership* change (a module leaves the active flow ordering of a YAML and becomes a reserve node); it touches no reducer, no store mutator, and no `KeyboardIR` write. The default build-list path's only output (`SurveyPhaseResult.confirmedInventory`, `PhaseB.tsx:610`) is untouched.
- **No contracts bump.** No `@keyboard-studio/contracts` change, no new `KeyboardIR` field, no §18 sign-off. The demotion uses existing `computeReserveNodes` / `buildModularFlowGraph` / registry shapes and existing `content/flows/*.modular.yaml` membership only. The retained `orthographyUrl` capture reuses the existing provenance surfaces (`packages/contracts/src/provenance.ts`, `PhaseA.tsx:163-164`) — no new field.
- **Behavior byte-identical (on the default path).** `selectStrategy` output for the **default build-list path** is unchanged (the path already leaves A1/A3/A4 unelicited; default-filling them from the script-class prior and recording each as `axisFills` is the §7 contract, not introduced here), verified against the §7.5 exemplar rows. The default-path render and the produced `SurveyPhaseResult.confirmedInventory` are byte-identical. The `pb_*` battery stays *reachable* (via the mandatory IntroChooser gate), so demotion does not remove a runtime path; it removes it from the **default** spine only.
- **Step appears as a map node.** Demoted modules are **not** removed from the map — they render as **reserve nodes** (`kind:"library-not-in-flow"`, `region:"not-yet-ordered"`) via `computeReserveNodes` (`buildStepGraph.ts:150-182`) on the `buildModularFlowGraph` registry-vs-YAML diff path. The `computeReserveNodes` machinery is *currently empty* (every registered module is in some YAML); this spec is what first populates it.
- **Read-only / declare-only as applicable.** This spec declares no new `inputs`/`writes` (spec 017 owns step contracts). It changes flow *membership* (which modules are in the active ordering vs. reserve) and adds the no-delete CI assertion. No module file is deleted; no module is unregistered.

## Clarifications

### Session 2026-06-29

Phase 1 scope was confirmed by Matt (2026-06-29, migration-plan §6): Phase 1 only specs converting the custom/bespoke flow stages into opaque "questions" with valid inputs and outputs, plus the demotion of the off-default batteries. For this spec:

- **Orphaned full Phase A disposition (§6 decision 3) — RESOLVED (Matt, 2026-06-29):** demote to the inert library (`identity_lite` is canonical); not deletion (no-delete guardrail §4); retain `orthographyUrl` capture in `identity_lite` / the documentation stage. The revival alternative (wire `PhaseA` into `StudioShell`) is **rejected**. **No `[NEEDS DECISION]`.**
- **Strategy-axis impact (§2.3) — RESOLVED as an acceptance criterion:** `selectStrategy` output for the default build-list path is unchanged; the gap (A1/A3/A4 unelicited on the default path) already exists today, so demoting the `pb_*` battery — the sole runtime elicitor of those axes — preserves today's default-path behavior and is **not a regression**. Verified against the §7.5 exemplar rows.

### Open items (preconditions / deferred — NOT Phase-1 blockers)

These are surfaced as `[NEEDS DECISION]` where genuinely undecided, but neither blocks Phase 1; they are a documented domain precondition and a deferred Phase-2 decision, not deliverables of this spec:

- **D1 — Non-Latin precondition (km-domain).** Demoting non-Latin `pb_*` script semantics **off the default** is acceptable **ONLY** until the Phase-2 per-element loop subsumes the script-specific mark/joining/order sub-series (`pb_mark_input_order` / `pb_stacking_marks` / direction-control routing). Phase 1 **must not flip a non-Latin default** to a path that drops those sub-series. This is carried as a **documented precondition on any future non-Latin default flip**, not a Phase-1 deliverable. **[NEEDS DECISION: D1 — the precondition is stated; whether/when a non-Latin default flips is gated on the Phase-2 loop subsuming `pb_*` script semantics, a post-Phase-1 decision.]**
- **D2 — Per-character axis feedback into the §7 vector (§6 item 2).** Whether per-character build-list answers should eventually re-elicit A1/A3/A4 inline (closing the default-fill gap) is **DEFERRED** to the post-Phase-1 developer decision. Phase 1 keeps axes **IR-write-only and default-fill-driven**. **[NEEDS DECISION: D2 — deferred to the post-Phase-1 developer decision; not actioned here.]**

No `[NEEDS CLARIFICATION]` markers remain.

## User Scenarios & Testing *(mandatory)*

> The "users" here are: the studio engineer reading the developer Flow Map (who wants the default spine to show the mature live paths while nothing is deleted and everything stays revivable); the km-strategy maintainer (who needs the demotion proven not to change `selectStrategy` output on the default path); and the linguist-agent consumer (whose `orthographyUrl` grounding input must survive Phase-A demotion). Each story is independently testable and independently valuable.

### User Story 1 - The rarely-taken `pb_*` battery and the orphaned full Phase A are demoted to the inert library and render as reserve nodes (Priority: P1)

A studio engineer wants the rarely-taken `pb_*` step-by-step battery and the orphaned full Phase A demoted off the default spine into the inert library and rendered as **reserve nodes**, so the default spine advertises the mature live paths while **nothing is deleted** and **everything stays revivable**.

**Why this priority**: This is the headline deliverable and the reason the spec exists. Findings (a) names the maturity inversion: the map advertises orphaned/low-maturity paths (`pb_*`, full Phase A) and hides the mature live ones. `computeReserveNodes` is the vestigial machinery for the fix but is currently empty — every registered module is in some YAML. This spec is what populates the reserve set, closing the inversion while preserving the no-delete guarantee.

**Independent Test**: With the dev flowmap flag on, render the Flow Map; confirm the `pb_*` battery (where off the active branch) and the full Phase A modules render as **reserve nodes** (`kind:"library-not-in-flow"`, `region:"not-yet-ordered"`) via `computeReserveNodes` (`buildStepGraph.ts:150-182`) on the `buildModularFlowGraph` diff path — present on the map but absent from the active default flow ordering. Confirm each demoted module is still **registered** in its sub-registry and still **on disk**.

**Acceptance Scenarios**:

1. **Given** the demotion has landed, **When** the Flow Map renders, **Then** the full Phase A modules (15 identity + 15 `provenance_*`, `content/flows/phase_a_identity.modular.yaml`) render as **reserve nodes** via `computeReserveNodes` — present on the map, absent from the active default flow ordering, never reached at runtime on the default path.
2. **Given** the demotion has landed, **When** the Flow Map renders, **Then** the `pb_*` step-by-step battery (`content/flows/phase_b_characters.modular.yaml`) is **off the default spine** and renders as a reserve node **where it is not on the active branch**, while remaining **reachable** via the mandatory IntroChooser discovery-method gate (the step-by-step branch).
3. **Given** any demoted module, **When** the no-delete state is inspected, **Then** the module is still **registered** in its sub-registry (`registry.a.ts` / `registry.b.ts`), still **on disk** (`survey/questions/<phase>/<id>.ts`), still **test-covered**, and **revivable** by re-adding its id to a YAML branch.

---

### User Story 2 - `selectStrategy` output for the default build-list path is unchanged after demotion (Priority: P1)

A km-strategy maintainer wants `selectStrategy` output for the **default build-list path** to be unchanged after demotion — the `pb_*` battery is the **sole runtime elicitor** of strategy axes A1/A3/A4, but the default build-list path already leaves them unelicited and `selectStrategy` default-fills them from the script-class prior (recording each as `axisFills`) — so demotion is **provably not a regression**, verified against the §7.5 exemplar rows.

**Why this priority**: This is the correctness guarantee that makes the demotion shippable. The `pb_*` battery uniquely drives A1 (`pb_char_count.ts:63-66`, Scale), A3 (`pb_typing_approach.ts:69-72`, phonetic-intuition), and A4 (`pb_stacking_marks.ts:44` / `pb_mark_input_order`, diacritic behaviour) onto `SurveyPhaseResult.computedAxes` (`surveyPhaseResult.ts:50`), which feeds `selectStrategy` (`browserPatternLibrary.ts:160`). But the default `BuildListView` collects inventory **only** (`confirmedInventory`) and leaves A1/A3/A4 unelicited **today** — the gap already exists on the default path. Per the §7 full-axis-vector input contract, `selectStrategy` default-fills the unelicited A1/A3/A4 from the script-class prior and records each as `axisFills`, so the output is unchanged. Without this proof, demoting the sole axis elicitor could be mistaken for a regression.

**Independent Test**: Run the §7.5 strategy-selection exemplar rows for the **default build-list path** (no A1/A3/A4 elicited; default-filled from the script-class prior) **before and after** this spec lands; assert the `selectStrategy` output (the recommended primary + secondaries) is **identical** on every exemplar row. Confirm the gap (A1/A3/A4 default-filled, recorded as `axisFills`) is the same gap that exists on today's default path — demotion neither introduces nor widens it.

**Acceptance Scenarios**:

1. **Given** the default build-list path (A1/A3/A4 unelicited), **When** `selectStrategy` runs after demotion, **Then** its output is **byte-identical** to the pre-demotion default-path output on every §7.5 exemplar row (the demotion removes only the *non-default* `pb_*` elicitation path, which the default path never traversed).
2. **Given** the unelicited A1/A3/A4 on the default path, **When** the strategy selector runs, **Then** they are **default-filled from the script-class prior** and each is recorded as `axisFills` (the §7 full-axis-vector input contract), so `selectStrategy` receives a complete vector and the output is unchanged — the gap is pre-existing, not introduced by demotion.
3. **Given** the §7.5 exemplar rows, **When** the strategy-axis acceptance test runs in CI, **Then** it is **green**, locking the default-path `selectStrategy` output across the demotion (a Tier-2-style strategy regression lock).

---

### User Story 3 - `orthographyUrl` capture is retained when Phase A is demoted (Priority: P2)

A linguist-agent consumer wants `orthographyUrl` capture retained when the full Phase A is demoted, so the linguist-agent grounding input is **not lost** even though the `provenance_*` modules go to the inert library.

**Why this priority**: Demoting the full Phase A drops the **runtime capture** of `orthographyUrl` (a linguist-agent grounding input) and community provenance, even though the `provenance_*` modules stay on disk (the Phase-A provenance caveat, §2.3). If nothing else captures `orthographyUrl`, the grounding input is silently lost on the default path. It is P2 because it is an enabling-retention guarantee for the demotion rather than a user-visible behavior on its own, but it is the one piece of the demotion that would lose a real input if omitted.

**Independent Test**: Run the default path (Phase A demoted); confirm `orthographyUrl` is still captured by `identity_lite` / the documentation stage (the retained surface), reusing the existing provenance shape (`packages/contracts/src/provenance.ts`; the existing capture at `PhaseA.tsx:163-164` is the reference, but the retained capture lives on the canonical `identity_lite` / documentation surface). Confirm the captured value is present on the produced result, not dropped.

**Acceptance Scenarios**:

1. **Given** the full Phase A is demoted to the library, **When** the default path runs, **Then** `orthographyUrl` capture is **retained** in `identity_lite` / the documentation stage — the grounding input is not lost (Phase-A provenance caveat, §2.3).
2. **Given** the retained capture, **When** the value is recorded, **Then** it reuses the **existing** provenance surface (`provenance.orthographyUrl`, `packages/contracts/src/provenance.ts`) — **no contracts bump**, no new field.
3. **Given** a default-path run with no `orthographyUrl` provided, **When** capture runs, **Then** it is a clean no-op (the field stays unset, exactly as today) — retention does not force the field.

---

### User Story 4 - The no-delete guardrail and the drift guardrail both stay green (Priority: P2)

A studio engineer can ship this demotion with a **no-delete CI assertion** confirming the `pb_*` and Phase A modules stay registered (and on disk + test-covered), and with the drift guardrail (016) staying green because demoted-but-registered modules are **reserve, not orphan** — and with `pnpm typecheck` + vitest + `pnpm depcruise` all green.

**Why this priority**: The no-delete guardrail (§4) is what makes "demotion ≠ deletion" enforced rather than asserted in prose, and the drift guardrail (016) is the headline Phase-1 invariant the demotion must not break. A demoted module that fell out of its sub-registry would be a silent deletion; a demoted module mis-modeled as an *orphan* (rather than *reserve*) would turn the 016 bijection RED. It is P2 because it is the non-functional safety net on US1–US3, but it is the gate that proves the demotion preserved both invariants.

**Independent Test**: Run the **no-delete CI assertion** — confirm every demoted `pb_*` and Phase A id is still a key in its sub-registry (`registry.b.ts` / `registry.a.ts`), still resolves to a module on disk, and still has test coverage; then delete a module file (or unregister an id) locally and confirm the assertion turns **RED**. Run the spec-016 drift guardrail — confirm green: the demoted modules are in the **reserve** set (`computeReserveNodes`), not the orphan set, so the rendered ⟺ runtime bijection holds (the bijection is over the *reachable* set; reserve modules are rendered by the separate `computeReserveNodes` mechanism). Run `pnpm typecheck`, vitest, and `pnpm depcruise`; confirm green.

**Acceptance Scenarios**:

1. **Given** the demoted `pb_*` and Phase A modules, **When** the no-delete CI assertion runs, **Then** it confirms each id is **still registered** in its sub-registry, **on disk**, and **test-covered** — and turns **RED** if any module is deleted or unregistered.
2. **Given** the demotion, **When** the spec-016 drift guardrail runs, **Then** it stays **green**: demoted-but-registered modules are **reserve** (rendered by `computeReserveNodes`), not **orphan**; the rendered ⟺ runtime bijection is asserted over the *reachable* set, and a registered-but-unreachable reserve module is rendered by the separate reserve mechanism (016 edge case).
3. **Given** the full gate, **When** `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` run, **Then** all are green, with no new `dashboard → stores` or `dashboard → editors` edge; default-path behavior is byte-identical.

---

### Edge Cases

- **Flag off entirely**: with `SHOW_FLOWMAP` off (`StudioShell.tsx:84`), `FlowMapView` does not mount, so no projection / no reserve-node rendering runs; the SPA still hand-places the live components, and the default-path behavior (build-list inventory, `selectStrategy` output, `orthographyUrl` capture) is byte-identical to today. The no-delete CI assertion still runs (it is a registry/disk check, independent of the flag).
- **`pb_*` battery is reachable, not removed**: the demotion takes the `pb_*` battery **off the default spine** but keeps it **reachable** via the mandatory IntroChooser gate (the step-by-step branch). So `pb_*` is **not** in the orphan set and **not** unreachable — it is reachable-but-non-default; it renders as a reserve node only **where it is not on the active branch**. (Contrast: full Phase A is genuinely off all default flow ordering and renders entirely as reserve.)
- **Demoted module is reserve, not orphan (016 distinction)**: a registered module absent from the active flow ordering is **reserve** (`computeReserveNodes`), which the 016 bijection explicitly excludes from the *reachable* set (016 edge case: "a registered-but-unreachable `questionRegistry` id … is rendered as a reserve node by a separate mechanism"). The demotion must keep demoted ids out of the *reachable* runtime set, NOT out of the registry — so 016 stays green.
- **Revival**: a demoted module is revivable by re-adding its id to a YAML branch (`content/flows/*.modular.yaml`) — no code change, no re-registration, no file restore (the file never left disk). The no-delete guarantee is what makes revival a one-line YAML edit.
- **Non-Latin `pb_*` script semantics off the default**: acceptable **only** until the Phase-2 per-element loop subsumes the script-specific mark/joining/order sub-series; Phase 1 must **not flip a non-Latin default** to a path that drops them (D1). Carried as a documented precondition; this spec does not flip any non-Latin default.
- **`orthographyUrl` not provided**: retention is a no-op when no `orthographyUrl` is given — the field stays unset exactly as today; retention does not force or fabricate the value.
- **`selectStrategy` on the non-default (step-by-step) `pb_*` path**: unaffected — the `pb_*` battery still elicits A1/A3/A4 when the author takes the step-by-step branch; the acceptance criterion is specifically about the **default build-list path** (the demotion removes `pb_*` from the *default* spine, not from the reachable step-by-step branch).
- **Deleting / unregistering a demoted module**: forbidden by the no-delete guardrail; the no-delete CI assertion turns RED. Demotion is a flow-membership change, never a registry or disk change.

## Requirements *(mandatory)*

### Functional Requirements

**The demotion to reserve/library (US1)**

- **FR-001 (MET):** The full non-identity Phase A (15 identity + 15 `provenance_*`, `content/flows/phase_a_identity.modular.yaml`) MUST be demoted into the **inert library** — absent from the active default flow ordering and rendered as **reserve nodes** via `computeReserveNodes` (`dashboard/buildStepGraph.ts:150-182`) on the `buildModularFlowGraph` registry-vs-YAML diff path. `identity_lite` is the canonical identity experience (§6 decision 3, RESOLVED). This spec MUST NOT wire `PhaseA` back into `StudioShell` (`StudioShell.tsx:18`) — the revival alternative is rejected. **Landed:** `renderedNodeSet.ts` drops the `phase_a_identity` `FLOW_SOURCES` entry, so the 30 modules render as `library-not-in-flow` reserve in the identity-lite drill-down and are no longer in `collectRenderedNodeIds` / the reachable set; spec-017's prefill anchor moved off `primary_script` to the live `il_target_script` to keep the 016/017 guardrails green.
- **FR-002**: ~~The `pb_*` step-by-step battery MUST be demoted off the default spine while remaining reachable via the IntroChooser gate.~~ **STRUCK (Amendment 2026-06-29, approved Matt + km-verification + km-domain).** "Reachable via the gate" and "renders as reserve" are an internal contradiction against the landed 015/016 model (reserve = `registry − reachable`; `computeReserveNodes` reserveIds = `registryKeys − liveIds`, and gate-reachability == YAML `liveIds` membership == what the live `PhaseB.tsx makeManualOnlyFlow` reads). The `pb_*` battery therefore **stays a live, reachable, non-default branch** off the **mandatory** IntroChooser gate (NOT library content); the gate stays mandatory with no auto-default. Any "off the default spine" re-ordering of `pb_*` is **DEFERRED to the Phase-2 per-element loop** (FR-011, D1).
- **FR-003**: Demoted modules — **the full non-identity Phase A only** (`pb_*` struck per the Amendment) — MUST render as reserve nodes through `computeReserveNodes` (`kind:"library-not-in-flow"`, `region:"not-yet-ordered"`, `isTerminal:true`) on the `buildModularFlowGraph` registry-vs-YAML diff path — the SAME mechanism the migration plan reserves for library content (§2.2(a): `computeReserveNodes` gets library content from the §2.3 YAML/registry demotions, NOT from the manifest projection). This spec is what first populates the reserve set with real library content (findings (a)).

**The no-delete guardrail (§4, US4)**

- **FR-004**: Demotion MUST be **not deletion**. Every demoted `pb_*` and Phase A module MUST remain **registered** in its sub-registry (`survey/questions/registry.b.ts` / `registry.a.ts`, merged via `registry.ts`), remain **on disk** (`survey/questions/<phase>/<id>.ts`), remain **test-covered**, and remain **revivable** by re-adding its id to a YAML branch. No module file is deleted; no module id is unregistered.
- **FR-005**: A **no-delete CI assertion** MUST enforce that the demoted `pb_*` and Phase A ids stay **registered** (a key in their sub-registry), **resolve to a module on disk**, and **remain test-covered**. The assertion MUST turn **RED** if any demoted module is deleted or unregistered. (Backs the §4 "A CI assertion enforces registry membership is preserved" guarantee.)

**Strategy-axis acceptance — `selectStrategy` output unchanged on the default path (§2.3, US2)**

- **FR-006**: `selectStrategy` output (`browserPatternLibrary.ts:160`) for the **default build-list path** MUST be **unchanged** by the demotion, verified against the §7.5 exemplar rows. The `pb_*` battery is the **sole runtime elicitor** of A1 (`pb_char_count.ts:63-66`), A3 (`pb_typing_approach.ts:69-72`), and A4 (`pb_stacking_marks.ts:44` / `pb_mark_input_order`) onto `SurveyPhaseResult.computedAxes` (`surveyPhaseResult.ts:50`), but the default `BuildListView` already leaves A1/A3/A4 **unelicited** (it collects `confirmedInventory` only) — so the demotion removes only the *non-default* `pb_*` elicitation path the default path never traversed.
- **FR-007**: On the default path, the unelicited A1/A3/A4 MUST be **default-filled from the script-class prior** and each recorded as `axisFills` (the §7 full-axis-vector input contract), so `selectStrategy` receives a complete vector and its output is unchanged — i.e., the demotion **preserves today's default-path behaviour and is not a regression** (the gap already exists on today's default path). The default-fill / `axisFills` mechanism is the §7 strategy contract; this spec does **not** introduce per-character re-elicitation (D2 is deferred to Phase 2). **[NEEDS DECISION: D2 — whether axes should eventually be re-elicited per-character is deferred to the post-Phase-1 developer decision (§6 item 2); Phase 1 keeps axes IR-write-only and default-fill-driven.]**

**`orthographyUrl` retention — the Phase-A provenance caveat (§2.3, US3)**

- **FR-008 (MET):** `orthographyUrl` capture (a linguist-agent grounding input) MUST be **retained** in `identity_lite` / the documentation stage when the full Phase A is demoted, so the grounding input is not lost. It MUST reuse the **existing** provenance surface (`provenance.orthographyUrl`, `packages/contracts/src/provenance.ts`; reference capture at `PhaseA.tsx:163-164`) — **no contracts bump**, no new field. When no `orthographyUrl` is provided, retention is a clean no-op (the field stays unset, exactly as today). **Landed:** wired into the live `extractIdentityLite` (`IdentityLite.tsx`) — it reads the `provenance_orthography_url` answer via the existing `answerString` helper and surfaces it on `IdentityLiteResult.orthographyUrl` (the canonical identity surface on the real default path); a no-answer run is a clean no-op (field omitted). Verified by `orthographyRetention.test.ts` asserting the value survives a real `extractIdentityLite` run.

**Guardrails & gate (US4)**

- **FR-009**: The spec-016 drift guardrail MUST stay **green**: the demoted-but-registered **Phase A** modules (the `pb_*` clause is struck per the Amendment — `pb_*` stays reachable/live) MUST be modeled as **reserve** (rendered by `computeReserveNodes`), NOT **orphan**. The rendered ⟺ runtime bijection (016) is asserted over the **reachable** set; a registered-but-unreachable reserve module is rendered by the separate reserve mechanism (016 edge case). The demotion MUST keep the demoted Phase A ids out of the *reachable* runtime set, NOT out of the registry.
- **FR-010**: The spec-016 drift guardrail (the rendered ⟺ runtime bijection) AND the FR-005 no-delete assertion MUST both stay green; default-path behavior MUST be **byte-identical**. `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` MUST be **green**, with no new `dashboard → stores` or `dashboard → editors` edge introduced.

**Out of scope (explicit non-goals)**

- **FR-011**: This feature MUST NOT **delete** any module (no-delete guardrail §4) or unregister any id; MUST NOT demote, re-order, or take the `pb_*` step-by-step battery off the default spine — the `pb_*` battery stays a **live, reachable, non-default branch** off the mandatory IntroChooser gate, and any `pb_*` re-ordering is **DEFERRED to the Phase-2 per-element loop** (Amendment 2026-06-29); MUST NOT re-incorporate non-Latin script-specific mark/joining/order sub-series — the non-Latin default-flip precondition (the loop must subsume `pb_*` script semantics) is a **Phase-2 gate** (D1) and Phase 1 does **not** flip a non-Latin default to a path that drops those sub-series; MUST NOT build the per-element loop or re-elicit A1/A3/A4 inline (Phase 2); MUST NOT wire `PhaseA` back into `StudioShell` (the revival alternative is rejected; Matt resolved demote); and MUST NOT introduce new write routing, `mutate()`, or a contracts bump — behavior MUST be byte-identical on the default path.

### Key Entities *(include if feature involves data)*

> No `@keyboard-studio/contracts` change. All entities below are **existing** symbols reused as-is (no contracts bump).

- **`computeReserveNodes`** (`dashboard/buildStepGraph.ts:150-182`): the function that emits `kind:"library-not-in-flow"` reserve nodes for registry ids absent from a flow's active ordering, appended via `buildModularFlowGraph` (`buildStepGraph.ts:200-208`). Currently empty (findings (a): "every registered module is listed in some YAML"); this spec is what populates it. Consumed, not modified.
- **`buildModularFlowGraph`** (`dashboard/buildStepGraph.ts:200-208`): the registry-vs-YAML diff path that resolves a `*.modular.yaml` flow and appends the reserve nodes from `computeReserveNodes`. The path on which demoted modules surface as reserve. Consumed, not modified.
- **`pb_*` step-by-step battery** (55 modules, `content/flows/phase_b_characters.modular.yaml`): the comprehensive-but-rarely-taken Phase B step-by-step battery; the sole runtime elicitor of strategy axes A1/A3/A4. Demoted off the default spine; kept reachable via the IntroChooser gate; rendered as reserve where off the active branch. Stays registered + on disk + test-covered (no-delete).
- **Full non-identity Phase A** (15 identity + 15 `provenance_*`, `content/flows/phase_a_identity.modular.yaml`): the orphaned battery (never imported by `StudioShell.tsx:18`); demoted to the inert library since `identity_lite` is canonical. Stays registered + on disk + test-covered (no-delete).
- **`questionRegistry` + sub-registries** (`survey/questions/registry.ts`, `registry.a.ts` / `registry.b.ts` / `registry.f.ts`): the consolidated module registry the no-delete assertion checks membership against. Demoted ids stay keys here. Unchanged in shape.
- **`content/flows/*.modular.yaml`**: the flow sources whose active ordering defines "live vs reserve". Demotion edits *membership* (which modules are in the active ordering) — the `pb_*` battery off the default spine (reachable via the gate), the full Phase A out of the default ordering entirely.
- **`selectStrategy`** (`@keyboard-studio/engine`, called at `browserPatternLibrary.ts:160`): the §7.2 decision-tree strategy selector over the discovery-axis vector. Its output on the **default build-list path** must be unchanged (default-filled A1/A3/A4 from the script-class prior, recorded as `axisFills`). Unchanged; the acceptance is on its output, not its code.
- **`SurveyPhaseResult.computedAxes`** (`surveyPhaseResult.ts:50`): where the `pb_*` battery writes A1/A3/A4. On the default path these stay unelicited (the gap default-fill closes). Unchanged.
- **`provenance.orthographyUrl`** (`packages/contracts/src/provenance.ts`; reference capture `PhaseA.tsx:163-164`): the existing provenance field the retained `orthographyUrl` capture reuses. No new field; no contracts bump.
- **No-delete CI assertion (new test artifact)**: asserts the demoted `pb_*` and Phase A ids stay registered + on disk + test-covered; turns RED on deletion/unregistration. Co-located with the existing manifest-shape / completeness / registry guards.
- **`SHOW_FLOWMAP`** (`StudioShell.tsx:84`): the dev-only flowmap gate under which the reserve nodes render; off ⇒ byte-identical to today (the no-delete assertion is flag-independent).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The `pb_*` battery and full Phase A are **absent from the active default flow ordering** and render as **reserve nodes** via `computeReserveNodes` (`kind:"library-not-in-flow"`, `region:"not-yet-ordered"`) — present on the Flow Map, never reached on the default path.
- **SC-002**: The `pb_*` battery remains **reachable** via the mandatory IntroChooser discovery-method gate (the step-by-step branch); no auto-default skipping the gate is introduced; the `pb_*` battery is unreachable on the *default* spine only.
- **SC-003**: A **no-delete CI assertion** confirms the demoted `pb_*` and Phase A ids stay **registered** (sub-registry key) + **on disk** + **test-covered**, and turns **RED** when a demoted module is deleted or unregistered (demonstrated against a local deletion/unregistration injection).
- **SC-004**: `selectStrategy` output for the **default build-list path** is **byte-identical** before/after the demotion on every §7.5 exemplar row (axisFills-driven; A1/A3/A4 default-filled from the script-class prior) — the demotion is provably **not a regression** on the default path.
- **SC-005**: `orthographyUrl` capture is **retained** in `identity_lite` / the documentation stage (reusing `provenance.orthographyUrl`, no contracts bump); a default-path run with no `orthographyUrl` is a clean no-op.
- **SC-006**: The spec-016 drift guardrail stays **green** — demoted-but-registered modules are **reserve** (rendered by `computeReserveNodes`), not **orphan**; the rendered ⟺ runtime bijection holds over the reachable set.
- **SC-007**: `pnpm typecheck` + studio/contracts `vitest` (incl. the no-delete assertion + the §7.5 strategy-axis lock) + `pnpm depcruise` pass; a repo audit finds **zero** deleted/unregistered modules, **zero** new IR write route, **zero** contracts bump, and **zero** `PhaseA`-into-`StudioShell` wiring.

## Assumptions

- **The orphaned-Phase-A disposition is RESOLVED — demote, not revive, not delete** (Matt, 2026-06-29, §6 decision 3). `identity_lite` is canonical; the `PhaseA`-into-`StudioShell` revival alternative is rejected; modules stay registered + on disk + test-covered (no-delete §4), flagged for later reuse.
- **`computeReserveNodes` is the demotion render mechanism and is currently empty** (findings (a): "every registered module is listed in some YAML"). This spec populates it via the §2.3 YAML/registry demotions — it is the `buildModularFlowGraph` diff path, NOT the manifest projection (§2.2(a)).
- **Spec 015 (map projection), spec 016 (drift guardrail), and spec 020 (build-list wiring) are landed.** Reserve nodes render through the modular path (015); the rendered ⟺ runtime bijection is the gate the demotion must keep green with demoted modules as *reserve, not orphan* (016); the default build-list branch — whose `selectStrategy` output must stay unchanged — is the default path off the same IntroChooser gate the `pb_*` battery is demoted off of (020).
- **The `pb_*` battery is the sole runtime elicitor of A1/A3/A4**, but the default `BuildListView` leaves them unelicited **today** (it collects `confirmedInventory` only). The gap is **pre-existing on the default path**; demotion preserves it, and the §7 contract default-fills A1/A3/A4 from the script-class prior (recorded as `axisFills`), so `selectStrategy` output is unchanged — not a regression.
- **The §7 default-fill / `axisFills` mechanism is the strategy contract**, not introduced by this spec. This spec's obligation is to **prove** `selectStrategy` output is unchanged on the default path against the §7.5 exemplars; it does not implement per-character axis re-elicitation (D2, deferred to Phase 2).
- **`orthographyUrl` retention reuses the existing provenance surface** (`provenance.orthographyUrl`, `packages/contracts/src/provenance.ts`) — no contracts bump; the existing `PhaseA.tsx:163-164` capture is the reference, but the retained capture lives on the canonical `identity_lite` / documentation surface so it survives Phase-A demotion.
- **Demotion is a flow-membership change, not a registry or disk change.** A module leaves a YAML's active ordering and becomes a reserve node; it never leaves the registry or disk. Revival is a one-line YAML edit (re-add the id to a branch).
- **The non-Latin precondition (D1) is a documented Phase-2 gate, not a Phase-1 deliverable.** Demoting non-Latin `pb_*` script semantics off the default is acceptable only until the Phase-2 loop subsumes them; Phase 1 does not flip any non-Latin default to a path that drops those sub-series.
- **Phase-1 invariants hold.** No new write routing, no `mutate()`, no contracts bump, default-path behavior byte-identical, demoted steps appear as reserve map nodes (read-only / declare-only / flow-membership-only as applicable).
