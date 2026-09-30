# Contract: Adaptation question catalog record

**Feature**: 038-adaptation-questions | Content-owned data (candidate status).

The catalog is one YAML record per question under `content/adaptation-questions/`.
A plain-node lint (`utilities/adaptation-catalog-lint/`, mirroring `facet-lint`,
wired into `pnpm lint`) enforces this contract. **Identifiers below are copied
verbatim from the spec's initial catalog and Verbatim Constraints — do not rename,
recase, or pluralize them.**

## Record schema

```yaml
id: q_sa1_target_script_spread        # matches filename; == survey module id when renders:true
family: script-alignment              # script-alignment | inheritance-posture | trust-policy
elicits: >
  Which script community this keyboard serves, when related keyboards exist in
  more than one script.
firingCondition: "sibling-script-spread > 1"   # non-empty; MUST NOT be "always"
prefill:
  facets: [script]                    # keyboard-level facet id(s) — real ids
  sessionFacet: community.multi-orthography   # optional; a content/facets/** id
provenanceLabel: "scripts used by existing keyboards for related languages"
consumers:                            # proposal sites (namespace:slug) and/or question ids
  - "base-suggestion:ranking"
  - "axis:A5"
noEvidenceDegradation: ask-plainly    # ask-plainly | record-no-default  (MUST be present)
scope: session                        # session | workflow  (MUST be present)
renders: true                         # true → survey module + flow entry exist
status: candidate                     # candidate | validated | active | retired
```

## Firing conditions for the v1 catalog (working predicates)

| id | family | firingCondition | noEvidenceDegradation | scope |
|---|---|---|---|---|
| `q_sa1_target_script_spread` | script-alignment | `sibling-script-spread > 1` | ask-plainly | session |
| `q_sa2_base_script_mismatch` | script-alignment | `dominant-script-disagreement OR base-script == mixed` | ask-plainly | session |
| `q_sa3_latin_flavor` | script-alignment | `target == Latn AND latin-subprofile-disagreement` | ask-plainly | session |
| `q_ip1_keep_strategies` | inheritance-posture | `base-has-strategy-fingerprint` | record-no-default | session |
| `q_ip2_keep_device_targets` | inheritance-posture | `base-target-mix != stated-device-mix` | ask-plainly | session |
| `q_ip3_keep_script_conventions` | inheritance-posture | `base-neutral-residue-has-script-variants` | record-no-default | session |
| `q_tp1_confidence_threshold` | trust-policy | `workflow-defaults-being-configured` | ask-plainly | workflow |
| `q_tp2_fallback_tier_prefill` | trust-policy | `any-base-classified-at-fallback-tier` | ask-plainly | workflow |
| `q_tp3_orthography_join` | trust-policy | `arab-or-alt-script-siblings-for-known-family` | record-no-default | session |

## Lint checks (all must pass; `pnpm lint` stays green)

- **C1 schema** — every record parses and matches the schema above.
- **C2 id/path** — `id` == filename (minus `.yaml`); ids unique.
- **C3 no-always** — `firingCondition` non-empty and `!= always` (Decision 4).
- **C4 required policy fields** — `noEvidenceDegradation` and `scope` present and
  in-enum (FR-004 / FR-006).
- **C5 real prefill facets** — every `prefill.facets` id is a real keyboard-facet;
  `prefill.sessionFacet` (when present) is a real `content/facets/**` id.
- **C6 renders↔module** — `renders: true` ⇒ `id` resolves to a real survey module
  under `packages/studio/src/survey/questions/`.
- **C7 family floor** — ≥ 3 records per family (FR-002 / SC-001).
- **C8 consumers form** — every `consumers` entry is `namespace:slug` or a real
  question id.

## Relationship to `facet-lint`

`facet-lint` continues to own facet-record validity. This lint owns the catalog.
The two meet at C5/C6: a catalog record's `prefill.sessionFacet` must be a facet
whose own `consumers.prefills`/`consumers.proposes` list names this question
(FR-008) — a cross-check the catalog lint reports and `facet-lint` corroborates.
