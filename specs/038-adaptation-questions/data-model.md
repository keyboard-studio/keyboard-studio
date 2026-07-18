# Phase 1 Data Model: En-Masse Adaptation Preference Questions

**Feature**: 038-adaptation-questions | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

Entities this feature introduces or reshapes. These are **content-owned data
shapes** (candidate status, empirical — not locked `packages/contracts` types),
plus two engine-owned session shapes. Field-level detail for the interfaces a
consumer/test codes against lives in [contracts/](contracts/).

## Entity 1 — Question record (`content/adaptation-questions/<id>.yaml`)

The catalog record. One YAML file per catalog question; `id` matches the filename
and (for rendered questions) the survey module id.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | e.g. `q_sa1_target_script_spread`; snake_case; equals the survey module id when rendered |
| `family` | enum | yes | `script-alignment` \| `inheritance-posture` \| `trust-policy` |
| `elicits` | string | yes | the preference this question teases out (plain language) |
| `firingCondition` | string | yes | evidence-state predicate (loose string, candidate grammar). **`always` is rejected by lint** (Decision 4) |
| `prefill.facets` | string[] | yes | keyboard-level facet id(s) that supply evidence, via… |
| `prefill.sessionFacet` | string | no | the `content/facets/**` id that carries the prefill into the session |
| `provenanceLabel` | string | yes | the §3c provenance-chip text naming the evidence + tier |
| `consumers` | string[] | yes | proposal sites (`namespace:slug`) and/or question ids that read the answer |
| `noEvidenceDegradation` | enum | yes | `ask-plainly` \| `record-no-default` (FR-004; may not be omitted) |
| `scope` | enum | yes | `session` \| `workflow` (FR-006) |
| `renders` | boolean | yes | `true` → a survey module + flow entry exists; `false` → policy-only/deferred |
| `status` | enum | yes | `candidate` \| `validated` \| `active` \| `retired` (facet lifecycle) |

**Validation rules** (enforced by the catalog lint, mirroring `facet-lint`):
- `id` matches filename; ids unique across the catalog.
- `firingCondition` is non-empty and not `always`.
- `noEvidenceDegradation` and `scope` are present and in-enum.
- When `renders: true`, `id` resolves to a real survey question module.
- Each `prefill.facets` entry resolves to a real keyboard-facet id; `sessionFacet`
  (when present) resolves to a real `content/facets/**` id.
- At least 3 records per `family` (FR-002 / SC-001 floor of 9).

## Entity 2 — Inheritance posture (session-scoped, engine)

The per-facet keep/propose/discard answer set for a session's confirmed base;
consumed en masse by proposal sites (FR-005).

| Field | Type | Notes |
|---|---|---|
| `baseId` | string | the confirmed base; posture is **per-base** (re-fires on base switch) |
| `entries` | `PostureEntry[]` | one per governed facet |
| `PostureEntry.facet` | enum | `script` \| `input-strategies` \| `device-targets` \| `script-conventions` |
| `PostureEntry.posture` | enum | `keep` \| `propose` \| `discard` |
| `PostureEntry.source` | enum | `default` \| `confirmed` \| `overridden` |
| `PostureEntry.provenance` | string | the fingerprint/evidence that prefilled it |

**State transitions**:
- Unset → `default` (US2 scenario 4: skip → §3c defaults, never blank).
- `default`/`confirmed` → `overridden` at an individual proposal site is **local**
  (FR-005): the `PostureEntry.posture` is *not* rewritten; the override lives on the
  proposal, and its chip reflects the override.
- Base switch → entries whose evidence changed reset to `default`; others persist
  (Edge case: mid-session base switch).

## Entity 3 — Trust policy (workflow- or session-scoped, engine)

Threshold + tier-permission answers governing firing conditions and prefill
eligibility (FR-006).

| Field | Type | Default | Scope | Governs |
|---|---|---|---|---|
| `singleScriptThreshold` | scalar (0–1) | `0.80` | workflow | all script-facet firing conditions (Q-TP1) |
| `allowFallbackTierPrefill` | boolean | `true` | workflow | base-suggestion ranking filter (Q-TP2) |
| `orthographyJoins` | `{ family, label }[]` | `[]` | session | base-suggestion labeling / gallery grouping (Q-TP3) |

Fallback-tier classifications remain **visually distinguishable** wherever they
prefill regardless of `allowFallbackTierPrefill` (FR-006).

## Entity 4 — Confirmation/override event (session, engine)

The recorded resolution of a facet-derived prefill; the facet evaluation harness's
predictive-lift input (FR-007 / SC-006).

| Field | Type | Notes |
|---|---|---|
| `questionId` | string | catalog/survey id |
| `facetIds` | string[] | the facet(s) that supplied the prefill |
| `prefilledValue` | string \| null | the derived default (null = no-default form) |
| `finalValue` | string | what the author accepted/entered |
| `action` | enum | `confirmed` \| `overridden` |
| `provenanceTier` | enum | `content-derived` \| `declared-metadata` \| `language-default` |
| `at` | ISO-8601 | stamped by the writer |

## Entity 5 — Adaptation evidence bundle (injected seam, engine)

The mockable input to firing-condition evaluation (Decision 3). Not persisted —
assembled from the facet index for the target language/base.

| Field | Type | Notes |
|---|---|---|
| `targetScript` | string | from `il_target_script` |
| `baseScriptDistribution` | `Record<script, share>` | from `keyboard-facets/script` |
| `siblingScriptSpread` | `Record<script, count>` | from `lineage/siblings` × index |
| `latinSubProfile` | enum \| null | plain \| extended \| ipa (base) |
| `strategyFingerprint` | `Record<StrategyId, share>` + `residue` | from `keyboard-facets/strategy-fingerprint` |
| `baseTargetMix` | set of `desktop`\|`touch`\|`web` | from `keyboard-facets/target-mix` |
| `provenanceTier` | enum | the tier that produced each value |

## Catalog → facet consumer wiring (FR-008)

The initial 9 questions and the facet records whose `consumers` are updated in the
same change (keeping `facet-lint` coverage honest). Working ids from spec §"initial
catalog"; final survey ids follow existing conventions at implementation.

| Catalog id | Family | Prefill session facet(s) | Facet record(s) updated |
|---|---|---|---|
| Q-SA1 target-script-vs-spread | script-alignment | `community.multi-orthography`, `lineage.siblings` | `community/multi-orthography.yaml`, `lineage/siblings.yaml` |
| Q-SA2 base-script-mismatch | script-alignment | `lineage.nearest-neighbors` (base script) | `lineage/nearest-neighbors.yaml` |
| Q-SA3 latin-flavor | script-alignment | `orth.regional-variant` / display | `orth/regional-variant.yaml` |
| Q-IP1 keep-strategies | inheritance-posture | `lineage.strategy-fingerprint` | `lineage/strategy-fingerprint.yaml` |
| Q-IP2 keep-device-targets | inheritance-posture | `env.device-mix` | `env/device-mix.yaml` |
| Q-IP3 keep-script-conventions | inheritance-posture | `community.input-conventions` | `community/input-conventions.yaml` |
| Q-TP1 confidence-threshold | trust-policy | — (policy dial, no facet prefill) | — |
| Q-TP2 fallback-tier-prefill | trust-policy | — (policy dial) | — |
| Q-TP3 orthography-join | trust-policy | `community.multi-orthography` | `community/multi-orthography.yaml` |

Trust-policy dials (Q-TP1/Q-TP2) are fed by policy, not a facet, so they carry no
facet prefill — their honest default *is* their no-evidence form (FR-004).
