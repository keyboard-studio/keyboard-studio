# criteria.md triage summary

This document records the triage outcome for all criteria drawn from `docs/criteria.md`, performed as part of Day-1 issue #6. Each criterion was assigned to one of four enforcement bands defined in spec.md Section 14, Decision D4: `scaffolder-bake` (enforced at scaffold time), `layer-c-enforce` (blocked by the lint engine), `yellow-survey` (surfaced as a plain-language survey question), and `red-checklist` (manual pre-submit checklist item). The result is encoded in `packages/contracts/data/criteria.json` as a `Criterion[]` array conforming to the interface in `packages/contracts/src/criteria.ts`, as described in spec.md Section 11's example triage table.

## Per-band counts

| Band | Count | % of total |
|------|-------|-----------|
| scaffolder-bake | 38 | 26% |
| layer-c-enforce | 66 | 45% |
| yellow-survey | 32 | 22% |
| red-checklist | 10 | 7% |
| **Total** | **146** | **100%** |

Counts recomputed directly from `criteria.json` array length and per-band occurrence counts. 133 of the original 145 are the original repo-hygiene criteria, accounting for all 133 colored criterion spans in `docs/criteria.md` (the 136-span count cited in earlier passes included the 3 legend-definition spans at lines 6-8, which are not criteria; see "Omitted rows" below). The remaining 12 are the **section-18 "Design heuristics (DISCUS)"** rows added to operationalize the keyboard-design principles in [docs/keyboard-design-principles.md](../../../docs/keyboard-design-principles.md) — 7 `layer-c-enforce` (auto-checkable on the first-draft touch layout / output coverage), 3 `yellow-survey` (judgement-dependent), and 2 `red-checklist` (inherently human). The total is now **146** following the issue #120 re-review, which added one new split row (`7.7a-display-name-no-underscores-lint`) and re-banded seven existing rows. See [docs/discus-principles-integration.md](../../../docs/discus-principles-integration.md) for the full DISCUS → programmability mapping.

## Re-review outcomes (issue #120)

The following 13 rows were flagged for re-review in the original triage (a second look before their band assignments were treated as final). Dispositions below are final. Criterion IDs with a letter suffix (e.g. `7.7a`) denote a row created by mechanically splitting an existing criteria.md span; the original ID retains the judgment half.

- **1.10-kpj-current-format** — **confirmed** scaffolder-bake. Description updated to pin the baked format: literal `version="10.0"` as of the Keyman Developer 17/18 era, with a note to bump when the format moves. No band change needed.
- **4.2-copyright-year-range-if-multiyear** — **confirmed** yellow-survey. Requires knowing the original submission year, which is not always derivable from files alone; human judgment appropriate.
- **4.8-year-range-starts-at-original** — **re-banded** layer-c-enforce → yellow-survey. Determining the "original year" requires consulting the first-published deployment history, not just the file content; mechanical enforcement is unreliable.
- **7.7-display-name-no-underscores** — **split** into two rows: `7.7` (yellow-survey) retains the readability judgment; new `7.7a-display-name-no-underscores-lint` (layer-c-enforce, `KM_LINT_DISPLAY_NAME_UNDERSCORE`) handles the mechanically checkable underscore-presence check. Total count +1.
- **7.21-compiles-no-errors** — **confirmed** layer-c-enforce. Intentional overlap with 7.6 is documented; both records are kept as distinct checks with different scopes (build-output context vs. source-review pass).
- **8.7-kps-includes-required-fonts** — **confirmed** layer-c-enforce. Description narrowed to clarify that the check is family-level presence only; full typeface (Bold/Italic) completeness is best-effort, not mechanically guaranteed. `KM_LINT_KPS_FONT_MISSING` unchanged.
- **9.5-shared-font-current-path** — **re-banded** yellow-survey → red-checklist. Path canonicality can change with repo restructuring; requires human verification of the current `shared/fonts` location in `keymanapp/keyboards`.
- **11.5-php-htm-html-wellformed** — **confirmed** layer-c-enforce. Band assignment is correct (HTML parser, not prose judgment). Description updated to note the in-browser DOMParser implementation.
- **11.6-php-osk-data-states-all-layers** — **confirmed** layer-c-enforce. Cross-reference notes added to both 11.6 and 11.2 descriptions to document the complementary direction split (11.2 = under-documentation; 11.6 = phantom layers).
- **11.8-php-osk-image-constrained** — **re-banded** yellow-survey → layer-c-enforce. Image-dimension inspection is automatable; assigned `KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED`.
- **12.6-script-mismatch-submitted-to-langtags** — **re-banded** yellow-survey → red-checklist. Requires out-of-band workflow confirmation (submission to langtags); not surfaceable as a survey question.
- **17.1-build-trigger-pr-comments-resolved** — **re-banded** yellow-survey → red-checklist. Requires reviewer workflow state; not derivable from file content.
- **17.3-build-issues-fed-back** — **re-banded** yellow-survey → red-checklist. Requires post-build workflow confirmation; sometimes partially surfaceable from build log but not reliably enough for a survey question.

## Omitted rows

- **Section 17, meta-criterion** ("All above checks have passed"): Pure aggregate gate at criteria.md line 207 — not an independent criterion on any artifact. Omitted per the rule: aggregate / cannot meaningfully be a single rule. This row is intentionally unmarked (no color span) in criteria.md.
- **Legend spans (criteria.md lines 6-8)**: The three colored legend-definition spans (Green, Yellow, Red) in the legend block are not criteria. They are counted in the "136 total colored spans" figure but are not triageable rules and are correctly absent from the JSON. Net criteria spans = 136 - 3 = 133.

## Hook population status (closed by #70; updated by #120)

All four automation-hook fields are now fully populated across every entry:

| Band | Field | Populated / Total |
|------|-------|-------------------|
| `layer-c-enforce` | `lintRuleId` | 66 / 66 |
| `scaffolder-bake` | `scaffolderRule` | 38 / 38 |
| `yellow-survey` | `surveyQuestionId` | 32 / 32 |
| `red-checklist` | `preSubmitChecklistText` | 10 / 10 |

`lintRuleId` values for sections 1–17 use the `KM_LINT_*` prefix (Layer C hygiene, no upstream kmcmplib equivalent). Section-18 DISCUS heuristics use `KM_WARN_*` to signal warning-grade rather than error-grade severity. `scaffolderRule` values use kebab-case action slugs. `surveyQuestionId` values use kebab-case descriptors. The rule identifiers are contracts — implementations in the lint engine, scaffolder, and survey surface must register against these IDs.

**Compile-related criteria prefix note:** `7.6-compiles-no-errors-no-warnings` (`KM_LINT_COMPILE_HAS_WARNINGS`) and `7.21-compiles-no-errors` (`KM_LINT_COMPILE_ERRORS`) both use the `KM_LINT_*` prefix even though they overlap with what the WASM compiler checks. This is correct: these criteria enforce a Layer C *policy* (keyboards submitted to `keymanapp/keyboards` must compile clean) rather than implementing the compiler's own error reporting. The two rules are distinct records because 7.6 covers warnings-as-errors policy and 7.21 covers the narrower build-output-context check.

**PUA cross-references (7.12 and 13.1) are not redundant:** `7.12-pua-not-in-experimental` (`KM_LINT_PUA_NOT_IN_EXPERIMENTAL`) fires during source review when PUA codepoints are detected in the `.kmn` file — a check on what the keyboard *encodes*. `13.1-pua-keyboard-placement` (`KM_LINT_PUA_KEYBOARD_PLACEMENT`) fires during the encoding/script survey to enforce keyboard placement policy — a check on *where* a PUA keyboard belongs in the repo layout. Different check sites, different artifacts, intentionally kept as separate records. The cross-references in each entry's `description` field document this relationship.

## Cross-references

- [spec.md Section 11](../../../spec.md) — example triage table showing band definitions in context.
- [spec.md Section 14, Decision D4](../../../spec.md) — authoritative band definitions and policy for band assignment.
- [packages/contracts/src/criteria.ts](../src/criteria.ts) — `Criterion` interface and `CriteriaBand` union type.
- [docs/lint.md](../../../docs/lint.md) — Layer C lint engine surface; all `layer-c-enforce` rows map to rules described there.
- [docs/making-a-template.md](../../../docs/making-a-template.md) — scaffolder surface; all `scaffolder-bake` rows map to scaffolder template behavior described there.
