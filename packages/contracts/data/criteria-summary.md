# criteria.md triage summary

This document records the triage outcome for all criteria drawn from `docs/criteria.md`, performed as part of Day-1 issue #6. Each criterion was assigned to one of four enforcement bands defined in spec.md Section 14, Decision D4: `scaffolder-bake` (enforced at scaffold time), `layer-c-enforce` (blocked by the lint engine), `yellow-survey` (surfaced as a plain-language survey question), and `red-checklist` (manual pre-submit checklist item). The result is encoded in `packages/contracts/data/criteria.json` as a `Criterion[]` array conforming to the interface in `packages/contracts/src/criteria.ts`, as described in spec.md Section 11's example triage table.

## Per-band counts

| Band | Count | % of total |
|------|-------|-----------|
| scaffolder-bake | 38 | 29% |
| layer-c-enforce | 58 | 44% |
| yellow-survey | 33 | 25% |
| red-checklist | 4 | 3% |
| **Total** | **133** | **100%** |

Counts recomputed directly from `criteria.json` array length and per-band occurrence counts. The 133 total accounts for all 133 colored criterion spans in `docs/criteria.md` (the 136-span count cited in earlier passes included the 3 legend-definition spans at lines 6-8, which are not criteria; see "Omitted rows" below).

## Flagged for re-review

The following 13 rows were flagged by lex-domain as warranting a second look before their band assignment is treated as final. (A prior summary pass incorrectly stated "18 flagged rows" with "remaining 5" pointing to IDs already named in the explicit list; the correct count is 13.)

- **1.10-kpj-current-format** (band: scaffolder-bake): `.kpj` file uses the current/newest project-file format — flagged because the "current format" baseline may need to be explicitly versioned in the scaffolder template.
- **4.2-copyright-year-range-if-multiyear** (band: yellow-survey): If updated across multiple years, copyright uses a year range — requires knowing the original submission year, which is not always derivable from files alone.
- **4.8-year-range-starts-at-original** (band: layer-c-enforce): If a year range is used, it starts at the original year and extends to the current year — requires comparing against deployed keyboard's first-published year.
- **7.7-display-name-no-underscores** (band: yellow-survey): Keyboard display name is a readable phrase, not the underscore-separated ID — borderline; regex could catch a literal underscore but "readable phrase" judgment cannot be fully mechanized.
- **7.21-compiles-no-errors** (band: layer-c-enforce): Keyboard compiles with no errors (build-output context) — partially overlaps with `7.6-compiles-no-errors-no-warnings`; both are emitted as distinct records.
- **8.7-kps-includes-required-fonts** (band: layer-c-enforce): All required fonts with all typefaces listed in the `.kps` — typeface completeness requires file inspection beyond a simple parse.
- **9.5-shared-font-current-path** (band: yellow-survey): Shared font path points to the current/newest shared-fonts location, not a deprecated duplicate — path canonicality can change; web/repo lookup required.
- **11.5-php-htm-html-wellformed** (band: layer-c-enforce): HTML in `welcome.htm` and `.php` is well-formed — classified as mechanical (HTML parser), not pure prose; band assignment is correct but flagged for tool-choice confirmation.
- **11.6-php-osk-data-states-all-layers** (band: layer-c-enforce): `.php` `data-states` attribute lists every layer defined in the `.kmn` and touch layout — overlaps with `11.2`; both emitted as distinct records.
- **11.8-php-osk-image-constrained** (band: yellow-survey): OSK graphics either use Keyman-generated form or custom images have width constraints — borderline mechanical; image-dimension inspection may be automatable.
- **12.6-script-mismatch-submitted-to-langtags** (band: yellow-survey): A flagged script mismatch has been submitted to langtags — borderline red; requires workflow state or out-of-band confirmation.
- **17.1-build-trigger-pr-comments-resolved** (band: yellow-survey): Author has resolved all PR comments before triggering a TeamCity build — borderline red; requires reviewer workflow state.
- **17.3-build-issues-fed-back** (band: yellow-survey): After the build runs, any issues it catches that local review missed were fed back to the author — borderline red; sometimes LLM-surfaceable from build log.

## Omitted rows

- **Section 17, meta-criterion** ("All above checks have passed"): Pure aggregate gate at criteria.md line 207 — not an independent criterion on any artifact. Omitted per the rule: aggregate / cannot meaningfully be a single rule. This row is intentionally unmarked (no color span) in criteria.md.
- **Legend spans (criteria.md lines 6-8)**: The three colored legend-definition spans (Green, Yellow, Red) in the legend block are not criteria. They are counted in the "136 total colored spans" figure but are not triageable rules and are correctly absent from the JSON. Net criteria spans = 136 - 3 = 133.

## Cross-references

- [spec.md Section 11](../../../spec.md) — example triage table showing band definitions in context.
- [spec.md Section 14, Decision D4](../../../spec.md) — authoritative band definitions and policy for band assignment.
- [packages/contracts/src/criteria.ts](../src/criteria.ts) — `Criterion` interface and `CriteriaBand` union type.
- [docs/lint.md](../../../docs/lint.md) — Layer C lint engine surface; all `layer-c-enforce` rows map to rules described there.
- [docs/making-a-template.md](../../../docs/making-a-template.md) — scaffolder surface; all `scaffolder-bake` rows map to scaffolder template behavior described there.
