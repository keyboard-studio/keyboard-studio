# Contract: Facet identifiers & value sets

The interface this feature exposes is **data**: the facet ids, their value sets, and the `--classified-only` index records keyed by those ids. Consumers (the §7.2 strategy selector, the base-selection surface, `facet-index-lint`, and the vitest fixtures) code against the exact strings below. **These identifiers are the contract — never renamed, recased, or pluralized.** Every string here is copied verbatim from `spec.md` (Functional Requirements + Clarifications).

## Keyboard-facet ids (13) → `content/keyboard-facets/<id>.yaml` + `DEFAULT_CLASSIFIERS[<id>]`

The keyboard-facet `id` is the filename stem and the `DEFAULT_CLASSIFIERS` key (lint contract C1). The session-family prefix (`lineage.`/`source.`/`env.`/`construction.`/`keyboard.`) names the **session-facet family** the value feeds, per the two-vocabulary model.

### US1 (P1)

| Keyboard-facet id | Session facet fed | Value set |
|---|---|---|
| `primary-strategy` | `lineage.primary-strategy` | one of `S-01`…`S-13`; honest tie recorded (not silently resolved) |
| `added-char-count` | `lineage.added-char-count` | integer count + spec-§7 **axis A1** band |
| `platform-coverage` | `source.platform-coverage` | subset of `{desktop, web, touch}` (modality only) |
| `font-dependency` | `source.font-dependency` | `{self-contained, system-font-reliant}` |

### US2 (P2)

| Keyboard-facet id | Session facet fed | Value set |
|---|---|---|
| `diacritic-mechanism` | `construction.diacritic-mechanism` | `{stacking-combining, replacing-cycling, multi-family, none}` |
| `combining-mark-repertoire` | *(none — `keyboard.*`)* | set of combining marks; `not-applicable` for abugida/abjad (guarded by `keyboard.script-family`) |
| `spare-key-budget` | `construction.spare-key-budget` | `{many, ralt-only, fully-booked}` |
| `orthography-coverage-ratio` | *(none — `keyboard.*`)* | `0.0`–`1.0` ratio + missing-character set; `not-derivable` when no CLDR exemplar set |

### US3 (P3)

| Keyboard-facet id | Session facet fed | Value set |
|---|---|---|
| `license-fork-eligibility` | `env.license-fork-eligibility` | `{permissive, copyleft, proprietary-restricted, unspecified}` |
| `directionality` | *(none — `keyboard.*`)* | `{ltr, rtl, bidi-aware}` |
| `script-family` | *(none — `keyboard.*`)* | `{alphabet, abugida, abjad, syllabary, logographic}` |
| `declared-bcp47-tags` | `source.declared-bcp47-tags` | set of BCP47 tags + claim-vs-actual mismatch exception |
| `package-completeness` | *(none session-family — `source.package-completeness` per FR-034/Key Entities)* | checklist absorbing OSK `.kvks`, `welcome.htm`, `.model.ts`, icon presence |

> `package-completeness` feeds `source.package-completeness` (FR-034 / Key Entities). The four with *no* mirror are exactly `directionality`, `script-family`, `combining-mark-repertoire`, `orthography-coverage-ratio` (FR-006, verbatim).

## Session-facet mirror ids (9) → `content/facets/<family>/<name>.yaml`

Authored **only** for family-named facets (FR-006):

```
lineage.primary-strategy
lineage.added-char-count
source.platform-coverage
source.font-dependency
source.declared-bcp47-tags
source.package-completeness
construction.diacritic-mechanism
construction.spare-key-budget
env.license-fork-eligibility
```

## Spec-§7 axis linkage (verbatim)

- `added-char-count` → **axis A1** (adaptation distance)
- `diacritic-mechanism` → **axis A4**
- `spare-key-budget` → **axis A7**

## Provenance & sentinel vocabulary (reused, verbatim)

- Provenance tier: `content-derived` when read from source; else the definition's `fallbackChain` tier.
- Honest sentinels: `not-applicable` (`combining-mark-repertoire` on abugida/abjad), `not-derivable` (`orthography-coverage-ratio` with no CLDR exemplar set), `unspecified` (`license-fork-eligibility` with no matching `LICENSE.md`).
- Cause tags on exception sites: `principled-split` / `capacity-forced` / `gap-omission` (spec-041 `cause-predicates.ts`).

## File-type → modality map (verbatim, Clarifications)

```
.kmx  → desktop
.js   → web
.keyman-touch-layout → touch
```
OS-level labels (windows/mac/linux/ios/android) are **NOT** emitted.

## Build & lint invariants the contract must satisfy

- `--classified-only` index build emits a record for every classified facet on every applicable base (SC-001: **13** new facets, zero `derivation.classifierId: planned`).
- `pnpm run facet-index-lint` (contract C1–C5 / X1–X7) and `pnpm run facet-lint` pass.
- The default (non-`--classified-only`) build still fails loud on a `planned` def with no classifier (Edge Cases).
- Deterministic: same corpus commit → byte-identical index; no git history, no network (FR-004 / SC-003).
