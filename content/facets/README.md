# Facet catalog

Facets are the studio's model of **everything around the language's input problem**:
the author, the typing community, the hardware/software environment, the corpus
neighborhood, and the delivery destination. They complement the discovery **axes**
(spec §7.1, A1–A7a): axes describe what the *orthography* needs; facets describe
who is asking, on what, for whom, and where the output goes.

Their purpose is spec **§3c — "Defaults are the product"**: every facet exists to
convert a signal the studio already holds into a *proposed default rendered as an
editable confirmation*. A facet earns its place in this catalog by the survey
questions it prefills (or eliminates) and the proposal sites it feeds. A facet
that consumes nothing is decoration and should be retired.

This catalog is **content-team-owned data** (spec §12), in the same spirit as
[`content/patterns/`](../patterns/) and the criteria catalog in
`packages/contracts/data/criteria.json`. The schema below is deliberately **not**
a locked Day-1 contract: the catalog is empirical, and records are expected to be
reshaped or retired as the evaluation metrics come in. Once the catalog survives
a full predictive-lift evaluation round, the schema graduates to
`packages/contracts` with the usual zod mirror + drift guard.

## Layout

One YAML file per facet, under its family directory:

```
content/facets/
  env/        environment — what the author/community types on
  author/     the person filling in the survey
  community/  the people who will type (distinct from the author!)
  orth/       computable facts about the target orthography (feed the axes)
  lineage/    corpus-relational — neighbors, siblings, priors
  dest/       where the output goes
  source/     the source keyboard's own construction — how ITS .kmn/touch-layout
              encodes, composes, reorders, and gates (feeds transform/gate proposals,
              not the survey axes directly)
```

The facet `id` is `<family>.<slug>` and must match its directory and filename
(`env/base-layout-affinity.yaml` → `env.base-layout-affinity`). Enforced by
`pnpm facet-lint`.

## Record schema

```yaml
id: orth.mark-composition-posture   # <family>.<slug>, matches path
family: orth                        # env | author | community | orth | lineage | dest | source
title: Short human title
description: >
  What this facet captures, in plain language. Written for a future
  contributor deciding whether their signal belongs here or in a new facet.
valueType: enum                     # enum | boolean | scalar | vector | set
values: [precomposed, combining, mixed]   # required when valueType == enum

modality: both                      # physical | touch | both
modalityNotes: >                    # optional — required when the facet's
  How the value is interpreted      # interpretation differs across modalities
  differently per modality.

derivations:                        # ordered best-first; at least one
  - kind: computed                  # computed | corpus | confirmed | asked
    source: "engine:nfcPostureOf"   # see source conventions below
    sourceStatus: planned           # available | planned
    notes: optional free text
  - kind: asked
    source: "question:pb_mark_style"
    sourceStatus: available

consumers:                          # what this facet feeds — the load-bearing field
  prefills:                         # survey question ids this facet can prefill
    - pb_mark_style                 # (lint: must be real question ids)
  proposes:                         # non-question proposal sites, "namespace:slug"
    - "axis:A4"
    - "mechanism-gallery:deadkey-vs-direct"

relatedAxes: [A4]                   # optional — axes this facet helps propose
provenanceLabel: "Unicode NFC analysis"   # the §3c provenance chip text

status: candidate                   # candidate | validated | active | retired
metrics:                            # written by the evaluation harness, not by hand
  predictiveLift: null              # agreement lift on held-out corpus keyboards
  discrimination: null              # mutual information vs observed design choices
  elicitationCost: computed         # cheapest available derivation kind

notes: >                            # optional working notes
  Anything a future editor needs.
```

### The `source/` family extension: transform-ready fields

`source/` records (see [docs/source-facets-design.md](../../docs/source-facets-design.md)
for the design brief) carry the same base schema above, plus additional fields
that make a facet's value **actionable**, not just descriptive — a base's
construction decisions may eventually be switched, and these fields carry what
a switch would need to know:

```yaml
transformImpactClass: behavior-preserving   # behavior-preserving | ux-changing | output-changing | gate
houseTargetPolicy:                          # decision-table: inputs -> target. null for gate/measure-only facets.
  inputs: [orth.display-difficulty]         # facet ids this policy reads
  rules:
    - when: "orth.display-difficulty == poorly-supported"   # string predicate
      target: u-notation
    - when: default                         # default row, matches when nothing else does
      target: quoted-literal
exceptionSites:                             # enumerated deviations from the dominant value
  - site: "K_M base char"
    cause: principled-split                 # the predicate-fit cause tag (see design brief §4)
causePredicates: [character-class, layer-capacity]   # the predicate library used to tag exceptionSites
implications: >                             # prose for the propose-then-confirm UI (§3c)
  What changes for the user if this facet's value is switched.
invertibility: lossless                     # lossless | lossy | one-way (coarse hint only)
```

- **`transformImpactClass`** — behavior-preserving / ux-changing / output-changing / gate;
  the axis a transform of this facet changes (design brief §3).
- **`houseTargetPolicy`** — an ordered decision-table, not a scalar default:
  `inputs` names the facet ids the policy reads, and `rules` is an ordered list
  of `{ when, target }` pairs evaluated top-down, ending in a `when: default`
  fallback row. `when` is a free-form string predicate (e.g. `"script != Latn"`),
  not a structured expression — modeled on the spec §7.2 ordered-decision-table
  *pattern*, not a literal reuse of the locked §7.2 tree or its
  `StrategyRecommendation` / `PrimaryRuleNumber` types. `null` for gate or
  measure-only facets. The string-predicate grammar is deliberately loose at
  candidate stage; it may formalize into a structured expression form if/when
  the `source/` family graduates out of empirical status.
- **`exceptionSites`** — the enumerated deviations from the dominant value; each
  carries a predicate-fit `cause` tag (`principled-split` / `capacity-forced` /
  `gap-omission`). The committed keyboard-facet index stores only the summary;
  the enumeration itself is deterministically recomputable.
- **`causePredicates`** — the predicate library this facet's classifier used to
  tag `exceptionSites` (e.g. `character-class`, `layer-capacity`).
- **`implications`** — human-readable "what changes if you switch this," feeding
  the §3c propose-then-confirm UI.
- **`invertibility`** — a coarse hint (`lossless` / `lossy` / `one-way`); the
  precise per-pair transition matrix and migration rules are owned by the
  transform engine spec, not by this catalog.

These fields are the **`source/` family extension**, empirical and
`status: candidate` like every other facet in this catalog — **not** a locked
`packages/contracts` type, and not required on the other five families.

### Derivation `source` conventions

| Prefix       | Meaning                                                      |
| ------------ | ------------------------------------------------------------ |
| `engine:`    | a named engine-team-owned derivation function, regardless of package boundary — usually under `packages/engine/src/**` (e.g. `detectBaseLayoutFamily`), but also engine-team code in a standalone utility (e.g. `displayDifficultyOfScript` in `utilities/facet-index/`) |
| `corpus:`    | a field mined from the keyboards-corpus fingerprint scan      |
| `question:`  | a survey question (kind `asked` or `confirmed`)               |
| `oauth:`     | a field from the authenticated identity                       |
| `session:`   | inferred from in-session behavior/answers                     |
| `planned:`   | an elicitation or function that does not exist yet            |

`sourceStatus: planned` marks honest aspirations — the lint allows them, the
runtime must ignore them. Never mark `available` unless the function/question
exists today.

### Lifecycle

`candidate` → `validated` → `active` → `retired`

- **candidate** — defined, consumers declared, no evidence yet. Everything starts here.
- **validated** — the evaluation harness measured real predictive lift on
  held-out corpus keyboards (the number lives in `metrics`).
- **active** — wired into the running studio (a derivation actually produces the
  prefill/proposal in the UI).
- **retired** — measured or judged not to earn its place; keep the file, flip the
  status, record why in `notes`. Retired facets are institutional memory.

Promotion from candidate is a **measurement**, not an argument: run the lift
harness, write the numbers into `metrics`, then flip the status.

## The coverage rule (§3c as a fitness function)

`pnpm facet-lint` extracts every survey question id from
`packages/studio/src/survey/questions/` and reports which questions **no facet
claims to prefill**. That list is the studio's defaults debt — per §3c, a
question rendering blank when a default was derivable is a defect. The count is
informational for now (the catalog is young); the direction it must move is
down. When a question is *deliberately* un-prefillable (a true free-text ask
with no derivable signal), record that as a no-default decision in the nearest
facet's `notes` — or accept it staying on the report.

Hard failures (lint exits non-zero): malformed records, id/path mismatches,
duplicate ids, `prefills` naming a question id that does not exist, malformed
`proposes` entries, `available` sources of kind `asked`/`confirmed` whose
question id does not exist.

## Adding a facet

1. Copy an existing record in the right family; pick the next natural slug.
2. Declare `consumers` first — if you cannot name a question it prefills or a
   proposal it feeds, it is not a facet yet.
3. Be honest in `derivations` (`planned` vs `available`).
4. `pnpm facet-lint` must stay green.
5. Leave `metrics` null; the harness fills them.

Regional teams: facets are exactly where region-specific knowledge belongs —
a community input-convention, a national reference layout, a regional digit
preference. Ship the record; the evaluation harness decides promotion.

## Related: the adaptation-question catalog

Facets supply the *evidence*; the adaptation-question catalog
([content/adaptation-questions/](../adaptation-questions/README.md), spec
[038](../../specs/038-adaptation-questions/spec.md)) turns that evidence into the
§3c confirmations that carry a base keyboard's classified values forward. A
catalog record's `prefill.sessionFacet` points here, and this facet's
`consumers.prefills` must name that question in return — a bijection
`adaptation-catalog-lint` (C5) and `facet-lint` corroborate (FR-008).
