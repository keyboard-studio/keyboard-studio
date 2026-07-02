# Implementation Plan: Library demote — full non-identity Phase A to reserve/library under the no-delete guardrail

> **Amendment (2026-06-29, approved Matt + km-verification + km-domain):** the `pb_*`
> step-by-step battery is **removed from library-demotion scope** — "reachable via the
> gate" ⊥ "renders as reserve" against the landed 015/016 model (reserve = `registry −
> reachable`); it stays a **live, reachable, non-default branch** and any re-ordering is
> deferred to the Phase-2 loop. Scope is now: demote the orphaned **full non-identity
> Phase A** to reserve (drop `phase_a_identity.modular.yaml` from `renderedNodeSet.ts`
> `FLOW_SOURCES`), the no-delete CI guardrail, and the §7.5 strategy-axis lock.
> **I-2 RESOLVED (landed):** the Phase-A→reserve move collided with spec-017's prefill
> anchor (`primary_script` reachability) — fixed by re-anchoring 017's prefill drill-down
> to the live `il_target_script` and updating `prefill.test.ts`. **FR-001 is MET.**
> **FR-008 (`orthographyUrl` retention) is DEFERRED** — it was never on the live
> IdentityLite path (only on the demoted Phase A), so the demotion loses no live capture;
> live capture needs a new live question, out of scope here, and **no inert capture code
> is shipped**. pb_* narrowing stands.

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 8 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 (orphaned-Phase-A decision item), §2.3 (library demotions + strategy-axis impact + non-Latin precondition + Phase-A provenance caveat), §4 (no-delete library guardrail), §5 spec #8, §6 decision 3 (RESOLVED — demote Phase A); findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (a) (maturity inversion + empty `computeReserveNodes`), (b) (full Phase A orphaned → library; `pb_*` reachable via gate, demote off default spine).

## Summary

Demote the rarely-taken `pb_*` step-by-step battery (55 modules, `content/flows/phase_b_characters.modular.yaml`) **off the default spine** — kept reachable via the mandatory IntroChooser discovery-method gate (the step-by-step branch) — and demote the orphaned full non-identity Phase A (15 identity + 15 `provenance_*`, `content/flows/phase_a_identity.modular.yaml`) into the **inert library**, both rendered as **reserve nodes** via `computeReserveNodes` (`dashboard/buildStepGraph.ts:150-182`) on the `buildModularFlowGraph` registry-vs-YAML diff path. Demotion is **not deletion** (no-delete guardrail §4): modules stay registered in their sub-registries, on disk, test-covered, and revivable; a **no-delete CI assertion** enforces preserved membership. Two domain constraints thread through: (1) `selectStrategy` output for the **default build-list path** is unchanged (axisFills-driven; A1/A3/A4 default-filled from the script-class prior), verified against the §7.5 exemplar rows — the demotion removes only the *non-default* `pb_*` elicitation path; and (2) `orthographyUrl` capture is retained in `identity_lite` / the documentation stage (reusing the existing provenance surface). No new write routing, no `mutate()`, no contracts bump, default-path behavior byte-identical.

## Why this is mostly a flow-membership change + two regression locks (the core design constraint)

| Concern | State entering this spec | What this spec does |
|---|---|---|
| Reserve-node render mechanism | `computeReserveNodes` exists but is **empty** (every module is in some YAML) | Populate it — demoted modules leave the active YAML ordering and surface as reserve nodes (no `computeReserveNodes` code change) |
| `pb_*` battery membership | On the step-by-step branch off the IntroChooser gate (`phase_b_characters.modular.yaml`) | Take **off the default spine**; keep **reachable** via the gate; reserve where off-branch |
| Full Phase A membership | Orphaned — in YAML, never rendered (`StudioShell.tsx:18` never imports `PhaseA`) | Demote out of the default ordering → inert library reserve nodes |
| No-delete guarantee | Asserted in prose (§4) | Enforce with a **no-delete CI assertion** (registered + on disk + test-covered) |
| `selectStrategy` default-path output | Already default-fills unelicited A1/A3/A4 (the gap pre-exists) | **Prove unchanged** against the §7.5 exemplar rows (regression lock) |
| `orthographyUrl` capture | Captured in Phase A (`PhaseA.tsx:163-164`); lost if Phase A demoted with nothing retaining it | **Retain** in `identity_lite` / documentation stage (reuse `provenance.orthographyUrl`) |
| `mutate()` / contracts / IR write / `PhaseA` revival | Phase 2 / rejected | Explicitly NOT done here |

So the *new artifacts* this spec adds are: the **no-delete CI assertion**, the **§7.5 strategy-axis regression lock** for the default path, and (if not already present on the canonical surface) the **retained `orthographyUrl` capture**. Everything else is a flow-membership edit that lets the already-built `computeReserveNodes` machinery render the demoted modules as reserve.

## Components / files to touch

- **EDIT (flow membership only)** `content/flows/phase_b_characters.modular.yaml` and `content/flows/phase_a_identity.modular.yaml` — remove the demoted modules from the **active default ordering** (the `pb_*` battery off the default spine but kept on the step-by-step branch reachable via the gate; the full Phase A out of the default ordering). This is the change that makes `computeReserveNodes` (`buildStepGraph.ts:158`: `reserveIds = Object.keys(registry).filter((id) => !liveIds.has(id))`) emit them as reserve nodes. **No module `.ts` file is deleted; no sub-registry entry is removed.**
- **NO EDIT** to `dashboard/buildStepGraph.ts` (`computeReserveNodes` / `buildModularFlowGraph` are consumed as-is), `survey/questions/registry.ts` / `registry.a.ts` / `registry.b.ts` (membership preserved — no-delete), `packages/contracts` (no bump), the strategy selector (`@keyboard-studio/engine` `selectStrategy`, `browserPatternLibrary.ts`), or `StudioShell.tsx` (no `PhaseA` revival).
- **NEW** test `packages/studio/src/survey/questions/noDeleteGuardrail.test.ts` (working name; co-locate with the existing registry guards / `registry.test.ts` and the manifest-shape / completeness guards per §2.5) — the **no-delete CI assertion**: for every demoted `pb_*` and Phase A id, assert it is a key in its sub-registry, resolves to a module on disk, and has test coverage; a local deletion/unregistration injection turns it RED.
- **NEW / EXTEND** test for the **§7.5 strategy-axis regression lock** — co-locate with the existing strategy-selection tests (e.g. alongside `browserPatternLibrary` / the engine `strategy-selector` exemplar tests): run the §7.5 exemplar rows for the default build-list path (A1/A3/A4 unelicited → default-filled from the script-class prior, recorded as `axisFills`) and assert `selectStrategy` output is identical before/after the demotion.
- **EDIT (retention, if not already on the canonical surface)** `identity_lite` / the documentation stage — retain `orthographyUrl` capture reusing the existing `provenance.orthographyUrl` field (reference: `PhaseA.tsx:163-164`). No new field; no contracts bump. (If `identity_lite` / the documentation stage already captures `orthographyUrl`, this reduces to a confirming test.)
- **NO new flag** — the reserve nodes render under the existing dev-only `SHOW_FLOWMAP` gate (`StudioShell.tsx:84`), inherited from spec 015. The no-delete CI assertion is flag-independent.

## Reserve-node / no-delete / strategy-lock design

1. **Demotion = flow-membership edit (the mechanism):** `computeReserveNodes` computes `reserveIds = registry keys − liveIds`, where `liveIds` is the union of a flow's `questions[]` + `provenance_questions[]` ids (`buildStepGraph.ts:154-158`). Removing a demoted id from a YAML's active ordering moves it from `liveIds` into `reserveIds`, so it renders as a `kind:"library-not-in-flow"` / `region:"not-yet-ordered"` reserve node automatically — **no `computeReserveNodes` code change**. For the `pb_*` battery, "off the default spine but reachable via the gate" means the battery stays on the step-by-step **branch** (still reached via `resolveNext` over the IntroChooser gate's `FlowGotoRule[]`), so it is reachable-but-non-default and renders as reserve only where it is not on the active branch; for full Phase A, the modules leave the default ordering entirely.
2. **No-delete CI assertion (the new artifact):** a registry/disk/coverage check, independent of the map. For each demoted id: assert `id in questionRegistry` (via the sub-registry), assert the module file resolves (the static import in the sub-registry already proves on-disk presence — a missing file fails the import at build), and assert test coverage exists in the mirrored tree. The RED demonstration deletes a module file (or removes a sub-registry entry) locally and confirms the assertion fails. This is the executable form of §4's "registry membership is preserved."
3. **Strategy-axis regression lock (the second new artifact):** the §7.5 exemplar rows are run for the **default build-list path** (no A1/A3/A4 elicited; the §7 contract default-fills them from the script-class prior and records `axisFills`). The lock asserts `selectStrategy` output (recommended primary + secondaries) is **identical** before/after the demotion — proving the demotion removes only the *non-default* `pb_*` elicitation path the default path never traversed, so it is not a regression. This is the `qu-library-demote` acceptance criterion (§2.3).
4. **`orthographyUrl` retention:** reuse the existing `provenance.orthographyUrl` field; capture it on the canonical `identity_lite` / documentation surface so the linguist-agent grounding input survives Phase-A demotion. No new field, no contracts bump; a no-`orthographyUrl` run is a clean no-op.
5. **Drift-guardrail (016) reconciliation:** demoted-but-registered modules must be **reserve**, not **orphan**. The 016 bijection is asserted over the *reachable* set and explicitly excludes reserve modules (016 edge case: a registered-but-unreachable id is rendered by the separate `computeReserveNodes` mechanism). So the demotion keeps demoted ids **out of the reachable runtime set** (off the default ordering) while keeping them **in the registry** — which is exactly the reserve condition, so 016 stays green.

## Intra-spec sequencing (within spec 022)

1. **Confirm dependencies landed** — spec 015 (reserve nodes render through the modular path), spec 016 (the bijection gate the demotion must keep green with demoted modules as *reserve*), spec 020 (the default build-list branch off the IntroChooser gate whose `selectStrategy` output must stay unchanged). This spec consumes those; it does not re-derive them.
2. **Pin the baselines BEFORE the membership edit** — capture the §7.5 default-path `selectStrategy` output baseline and the current `orthographyUrl` capture behaviour, so the regression locks have a pre-demotion reference. (Mirrors spec 020's "write the oracle first to pin the baseline.")
3. **Edit YAML membership** — take the `pb_*` battery off the default spine (keep it on the gate-reachable step-by-step branch) and take full Phase A out of the default ordering. This is the demotion proper; `computeReserveNodes` then emits the reserve nodes.
4. **Add the no-delete CI assertion** — registered + on disk + test-covered; demonstrate the RED case.
5. **Add / confirm the `orthographyUrl` retention** on the canonical surface.
6. **Add the §7.5 strategy-axis regression lock** for the default path.
7. **Run the full gate** — spec-016 drift guardrail green (demoted = reserve, not orphan); no-delete assertion green; strategy lock green; typecheck, vitest, depcruise.

> Note on cross-spec sequencing: this is the **final** Phase-1 spec (#8). It depends on the build-list wiring (020) — the `pb_*` battery is demoted off the *same* IntroChooser gate the default build-list branch hangs from (020), so 020's "the `pb_*` battery is the other branch off the same gate — its demotion is spec 022" hand-off lands here. The `pb_*` battery must stay reachable via that gate after demotion (FR-002).

## How the Phase-1 invariants are preserved

- **No new write routing / no `mutate()`:** demotion is a flow-membership edit (YAML active-ordering) — it touches no reducer, no store mutator, and no `KeyboardIR` write. The default build-list path's only output (`SurveyPhaseResult.confirmedInventory`) is untouched (FR-011).
- **No contracts bump:** uses existing `computeReserveNodes` / `buildModularFlowGraph` / registry shapes and existing `content/flows/*.modular.yaml` membership; the `orthographyUrl` retention reuses the existing `provenance.orthographyUrl` field; `packages/contracts` untouched (FR-008/FR-011).
- **Behavior byte-identical (default path):** `selectStrategy` output for the default build-list path is locked identical against the §7.5 exemplars (FR-006/FR-007/SC-004); the default render and the produced `confirmedInventory` are byte-identical; the `pb_*` battery stays *reachable* (via the gate), so demotion removes it from the *default* spine only, not from runtime (FR-002).
- **Step appears as a (reserve) map node:** demoted modules render as reserve nodes via `computeReserveNodes` (`kind:"library-not-in-flow"`) — present on the map, absent from the active ordering (FR-001/FR-003/SC-001).
- **Read-only / declare-only / flow-membership-only:** this spec declares no new `inputs`/`writes` (017 owns step contracts); it changes flow membership and adds the no-delete assertion + the two regression locks. No module file is deleted; no id is unregistered (FR-004/FR-005).
- **No-delete guardrail enforced:** the no-delete CI assertion makes "demotion ≠ deletion" executable — registered + on disk + test-covered, RED on deletion/unregistration (FR-004/FR-005/SC-003).
- **Drift guardrail stays green:** demoted-but-registered modules are *reserve*, not *orphan*; the 016 bijection holds over the reachable set (FR-009/FR-010/SC-006).
- **No `PhaseA` revival:** `StudioShell.tsx:18` is not touched — the revival alternative is rejected; demote is the resolved disposition (FR-001/FR-011/SC-007).

## Risks & mitigations

- **Mis-modeling a demoted module as `orphan` rather than `reserve` (turns 016 RED):** the most likely way this spec could break the headline Phase-1 invariant. Mitigation: demoted ids stay **registered** (in `registry.*`) and only leave the **active YAML ordering**, which is exactly the `computeReserveNodes` reserve condition (`reserveIds = registry − liveIds`); the 016 bijection is over the *reachable* set and excludes reserve modules (FR-009/SC-006).
- **Accidentally deleting/unregistering a module (silent deletion):** the temptation when "demoting" feels like "removing." Mitigation: FR-004/FR-005 forbid it; the no-delete CI assertion turns RED on deletion/unregistration; demotion is a YAML-membership edit only.
- **Making the `pb_*` battery unreachable (over-demotion):** demoting it off the *default spine* must not make it unreachable — it stays on the gate-reachable step-by-step branch. Mitigation: FR-002 keeps it reachable via the mandatory IntroChooser gate; the drift guardrail checks the build-list/`pb_*` boundary in the **question** graph (016 US3).
- **Mistaking the demotion for a `selectStrategy` regression:** the `pb_*` battery is the sole A1/A3/A4 elicitor, so demoting it *looks* like dropping strategy signal. Mitigation: the default build-list path already leaves A1/A3/A4 unelicited (the gap pre-exists); the §7 contract default-fills from the script-class prior (`axisFills`); the §7.5 regression lock proves `selectStrategy` output is unchanged on the default path (FR-006/FR-007/SC-004).
- **Losing `orthographyUrl` capture on Phase-A demotion:** the Phase-A provenance caveat — demoting Phase A drops its runtime capture. Mitigation: FR-008 retains it in `identity_lite` / the documentation stage reusing the existing `provenance.orthographyUrl` field (SC-005).
- **Flipping a non-Latin default (D1 precondition violation):** demoting non-Latin `pb_*` script semantics off the default is acceptable only until the Phase-2 loop subsumes them. Mitigation: Phase 1 does **not** flip any non-Latin default (FR-011); D1 is carried as a documented precondition, not actioned here.
- **Per-character axis re-elicitation creeping in (D2):** deferred to Phase 2. Mitigation: FR-007 keeps axes IR-write-only and default-fill-driven; D2 is explicitly deferred.

## Test strategy (per migration-plan §2.5 / §4)

- **No-delete CI assertion (FR-004/FR-005):** for every demoted `pb_*` and Phase A id, assert it is a sub-registry key, resolves to a module on disk, and has test coverage; demonstrate RED on a local deletion/unregistration injection. Co-locate with the existing registry/manifest-shape/completeness guards.
- **Strategy-axis regression lock (FR-006/FR-007):** run the §7.5 exemplar rows for the default build-list path (A1/A3/A4 unelicited → default-filled from the script-class prior, recorded as `axisFills`); assert `selectStrategy` output is identical before/after the demotion. A Tier-2-style strategy regression lock co-located with the existing strategy-selection exemplar tests.
- **`orthographyUrl` retention test (FR-008):** with Phase A demoted, assert `orthographyUrl` is captured by `identity_lite` / the documentation stage (reusing `provenance.orthographyUrl`); a no-`orthographyUrl` run is a clean no-op.
- **Reserve-node assertion (FR-001/FR-003):** assert the demoted `pb_*` and Phase A modules render as reserve nodes (`kind:"library-not-in-flow"`) via `computeReserveNodes` on the `buildModularFlowGraph` path — present on the map, absent from the active ordering. Keep additive; do not repurpose the spec-015 tests.
- **Reachability assertion (FR-002):** the `pb_*` battery stays reachable via the mandatory IntroChooser gate (the step-by-step branch); no auto-default is introduced.
- **Drift guardrail (spec 016):** green — demoted-but-registered modules are *reserve*, not *orphan*; the rendered ⟺ runtime bijection holds over the reachable set (016 edge case for reserve modules).
- **Don't regress physical / touch:** unaffected by this spec, but the full suite (incl. the R1/R2 reference locks) must stay green.
- **Boundary:** `pnpm depcruise` (dashboard stays store-free); `pnpm typecheck`; studio + contracts `vitest`.

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green; forbids `dashboard → stores`)
- Full gate: `pnpm typecheck` + studio/contracts vitest (incl. the no-delete assertion + the §7.5 strategy-axis lock + the spec-016 drift guardrail with demoted modules as reserve) + `pnpm depcruise` + flag-off default-path behavior byte-identical
