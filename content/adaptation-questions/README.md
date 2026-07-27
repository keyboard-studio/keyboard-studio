# Adaptation questions catalog

Content-owned data set for spec [038-adaptation-questions](../../specs/038-adaptation-questions/spec.md).
One YAML record per question under `content/adaptation-questions/`, mirroring the
`content/facets/` convention. A plain-node lint
([utilities/adaptation-catalog-lint](../../utilities/adaptation-catalog-lint/index.js),
wired into `pnpm lint` after `facet-lint`) keeps every record honest.

These records carry the metadata a `FlowQuestion` has no home for: the
evidence-state **firing condition**, the **prefill** source, the §3c
**provenance-chip** text, the downstream **consumers**, the **no-evidence
degradation**, and the **scope**. When a record renders, its `id` is also the
survey-module id so `facet-lint` can resolve it.

## Record schema (Entity 1 — [data-model.md](../../specs/038-adaptation-questions/data-model.md))

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `snake_case`; equals the filename stem and (when `renders: true`) the survey-module id |
| `family` | enum | yes | `script-alignment` \| `inheritance-posture` \| `trust-policy` |
| `elicits` | string | yes | the preference this question teases out (plain language) |
| `firingCondition` | string | yes | evidence-state predicate (loose candidate grammar). **`always` is rejected by lint** |
| `prefill.facets` | string[] | yes | keyboard-level facet id(s) (`content/keyboard-facets/*.yaml`) that supply evidence — may be empty for pure policy dials |
| `prefill.sessionFacet` | string | no | the `content/facets/**` id that carries the prefill into the session; when present, that facet's `consumers` must name this question |
| `provenanceLabel` | string | yes | the §3c provenance-chip text naming the evidence + tier |
| `consumers` | string[] | yes | proposal sites (`namespace:slug`) and/or survey question ids that read the answer |
| `noEvidenceDegradation` | enum | yes | `ask-plainly` \| `record-no-default` (FR-004; never omitted) |
| `scope` | enum | yes | `session` \| `workflow` (FR-006) |
| `renders` | boolean | yes | `true` → a survey module + flow entry exists; `false` → policy-only/deferred |
| `status` | enum | yes | `candidate` \| `validated` \| `active` \| `retired` (facet lifecycle) |

## Lint checks (C1–C8)

- **C1 schema** — every record parses and matches the schema above.
- **C2 id/path** — `id` == filename stem; ids unique across the catalog.
- **C3 no-always** — `firingCondition` non-empty and `!= always`.
- **C4 required policy fields** — `noEvidenceDegradation` and `scope` present and in-enum.
- **C5 real prefill facets** — every `prefill.facets` id is a real keyboard-facet
  (`content/keyboard-facets/`); `prefill.sessionFacet` (when present) is a real
  `content/facets/**` id whose own `consumers` names this question.
- **C6 renders↔module** — `renders: true` ⇒ `id` resolves to a real survey module
  under `packages/studio/src/survey/questions/`.
- **C7 family floor** — every family that has any records has ≥3 (FR-002 / SC-001
  floor of 9). An empty catalog is allowed (lint stays green mid-migration).
- **C8 consumers form** — every `consumers` entry is `namespace:slug` or a real
  survey question id.

## Catalog inventory

| id | family | fires when | renders |
|---|---|---|---|
| `q_sa1_target_script_spread` | script-alignment | related keyboards span >1 script | yes |
| `q_sa2_base_script_mismatch` | script-alignment | base script disagrees / is mixed | yes |
| `q_sa3_latin_flavor` | script-alignment | Latin target, sub-profile disagreement | yes |
| `q_ip1_keep_strategies` | inheritance-posture | base has a strategy fingerprint | yes |
| `q_ip2_keep_device_targets` | inheritance-posture | base target-mix ≠ stated device mix | yes |
| `q_ip3_keep_script_conventions` | inheritance-posture | base residue has script variants | yes |
| `q_tp1_confidence_threshold` | trust-policy | workflow defaults being configured | yes |
| `q_tp2_fallback_tier_prefill` | trust-policy | a base classified at fallback tier | yes |
| `q_tp3_orthography_join` | trust-policy | alt-script siblings for a known family | yes |

## Lifecycle

Records ship at `status: candidate`. They graduate to `validated`/`active` as the
facet evaluation harness accumulates confirmation/override evidence
([confirmationEvents](../../packages/studio/src/adaptation/confirmationEvents.ts),
FR-007). This mirrors the facet-catalog lifecycle in
[content/facets/README.md](../facets/README.md).
