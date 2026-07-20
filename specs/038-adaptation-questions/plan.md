# Implementation Plan: En-Masse Adaptation Preference Questions

**Branch**: `038-adaptation-questions` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/038-adaptation-questions/spec.md](spec.md)

## Summary

Deliver the **question catalog** that lets the studio carry a base keyboard's
classified facet values (script, input strategies, device targets) forward as
*en-masse* prescriptions — always surfaced as §3c editable confirmations with
provenance, never silent defaults. The catalog is a content-owned data set of ≥ 9
questions across three families (**script alignment**, **inheritance posture**,
**trust policy**); each rendered question is also a real survey question module so
`facet-lint` consumer checks pass, and the feeding facet records get their
`consumers` lists updated in the same change (FR-008). The one new engine surface
is the **inheritance-posture confirmation step** (US2); script-alignment reuses the
existing `Prefill.tsx` confirmation pattern and trust policy renders as ordinary
flow questions. Firing conditions read the facet index (036/037) behind an
**injected evidence seam** so the whole feature is authorable and walkable against
a mocked index now — the live consumption/ranking wiring is an explicit follow-up
feature (Out of Scope). Confirmation/override events are recorded in a
harness-readable form (FR-007) to seed the facet catalog's first predictive-lift
measurements.

Key design decisions and their rationale are in [research.md](research.md); the
data shapes in [data-model.md](data-model.md); the enforceable interfaces in
[contracts/](contracts/).

## Constitution Check

*GATE: passed before Phase 0 research; re-checked after Phase 1 design — still passing.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS** | No `Pattern`/`Criterion` type edited. The catalog is content-owned candidate data (like the facet catalog, not graduated to `packages/contracts`); engine surfaces add new local types only. |
| II. KeyboardIR is the engine spine | **PASS** | This feature reads the *facet index* (derived from parsed IR by 036/037), not raw `.kmn`. No new parse path; the evidence seam consumes already-classified records. |
| III. Single persistent working copy | **PASS** | Inheritance posture and confirmations mutate the one working copy's session state; nothing serializes intermediately or forks a second copy. |
| IV. Validator layering / one 300 ms debounce | **PASS** | No validator layer touched; no new debounce timer. Confirmation surfaces are survey/step UI, not the editor validation cycle. |
| V. VirtualFS only during authoring | **PASS** | No host-disk writes. The evidence seam is injected (studio reads the committed index in the follow-up wiring feature, not here); events append to in-memory session state. |
| VI. Team boundaries (§12/§13) | **PASS** | **Content** owns the catalog data, survey question modules, flow wiring, and facet-record `consumers` updates. **Engine** owns the inheritance-posture step, firing-condition evaluator, evidence seam, and event recorder. Mirrors the spec's own ownership Assumption. |
| VII. Out of scope for v1 | **PASS** | No CJK/Ethiopic authoring; no LDML; no touch-first authoring (Q-IP2 *routes to* the existing §8 Phase B / mobile-touch-derivation flow, it does not author touch). No multi-keyboard batch UI. No locked-contract change. |
| VIII. House conventions | **PASS** | `[OK]`/`[WARN]`/`[ERROR]` in any tool output; markdown links in user-facing text; `feat(studio)`/`feat(criteria)` commit style; no issue numbers in shipped code. |

**No violations → Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/038-adaptation-questions/
├── plan.md                      # This file
├── research.md                  # Phase 0 — 7 design decisions (generated)
├── data-model.md                # Phase 1 — 5 entities + catalog→facet wiring (generated)
├── contracts/                   # Phase 1 — the enforceable interfaces (generated)
│   ├── question-catalog.contract.md      # content data record + 8 lint checks
│   └── adaptation-engine.contract.md     # firing / posture / policy / events (engine)
├── checklists/                  # pre-existing (from /speckit-checklist)
└── tasks.md                     # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
content/adaptation-questions/                 # NEW (content) — the catalog data set
├── q_sa1_target_script_spread.yaml           # US1 script alignment (×3)
├── q_sa2_base_script_mismatch.yaml
├── q_sa3_latin_flavor.yaml
├── q_ip1_keep_strategies.yaml                # US2 inheritance posture (×3)
├── q_ip2_keep_device_targets.yaml
├── q_ip3_keep_script_conventions.yaml
├── q_tp1_confidence_threshold.yaml           # US3 trust policy (×3)
├── q_tp2_fallback_tier_prefill.yaml
└── q_tp3_orthography_join.yaml

packages/studio/src/survey/questions/b/       # NEW (content) — RESERVE survey modules
├── <q_sa1..q_tp3 modules>.ts                 # authored + lint-resolved, but deliberately
                                              # NOT registered in registry.b.ts and NOT
                                              # listed in the Phase B flow — see the
                                              # "Reserve-module decision" note in tasks.md.
                                              # Adaptation surfaces render via firing.ts +
                                              # Prefill.tsx (US1), InheritancePostureStep.tsx
                                              # (US2), and resolveTrustPolicy (US3), so a
                                              # clean single-script walk adds zero questions
                                              # (SC-002/SC-003).

# registry.b.ts / content/flows/phase_b_characters.modular.yaml are NOT modified by this
# feature (the reserve-module decision above supersedes the original flow-wiring plan).

content/facets/                               # UPDATED (content) — consumers wiring (FR-008)
├── community/multi-orthography.yaml          # + Q-SA1, Q-TP3
├── lineage/siblings.yaml                     # + Q-SA1 evidence
├── lineage/nearest-neighbors.yaml            # + Q-SA2
├── orth/regional-variant.yaml               # + Q-SA3
├── lineage/strategy-fingerprint.yaml         # + Q-IP1
├── env/device-mix.yaml                       # + Q-IP2
└── community/input-conventions.yaml          # + Q-IP3

packages/studio/src/adaptation/               # NEW (engine) — the touchpoint surfaces
├── evidence.ts                               # AdaptationEvidence seam + provider iface
├── firing.ts                                 # evaluateFiringConditions (pure)
├── posture.ts                                # buildPosture / postureFor (pure)
├── InheritancePostureStep.tsx                # §3c confirmation step (US2)
├── trustPolicy.ts                            # TrustPolicy + scope persistence
├── confirmationEvents.ts                     # recordConfirmation (FR-007)
└── *.test.ts / *.test.tsx                    # firing, posture, events, mocked-index walk

packages/studio/src/survey/Prefill.tsx        # UPDATED (engine) — US1 script-alignment rows

utilities/adaptation-catalog-lint/index.js    # NEW (content-adjacent) — catalog lint (C1–C8)
                                              # wired into `pnpm lint` after facet-lint
```

**Structure Decision**: The catalog is a new content-owned data directory
(`content/adaptation-questions/`) — matching the facet-catalog convention the spec
cites — with its own plain-node lint wired into `pnpm lint`. Rendered questions
live as real survey modules under the existing `questions/b/` tree so `facet-lint`
resolves their ids. The engine touchpoint is isolated in a new
`packages/studio/src/adaptation/` module so the injected evidence seam, firing
evaluator, posture step, and event recorder are unit-testable against a mocked
index without pulling in the not-yet-built ranking wiring. This keeps the
content/engine boundary (Article VI) crisp: content ships data + survey text under
`content/` and `questions/`; engine ships surfaces under `packages/studio/src/`.

## Complexity Tracking

> No Constitution violations. Section intentionally empty.
