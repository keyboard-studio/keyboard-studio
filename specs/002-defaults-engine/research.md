# Phase 0 Research: Defaults engine

All unknowns from the Technical Context resolved here. Each entry: **Decision / Rationale / Alternatives considered**. Findings are grounded in a reconnaissance pass over the existing codebase (cited by path), per the "look at what already exists" directive.

## R1. Where does the `axisFills` provenance record live? (FR-011)

- **Decision**: Add an optional `axisFills?: AxisFill[]` field to `SurveyPhaseResult` (`packages/contracts/src/surveyPhaseResult.ts`), and surface the merged set on `SurveySession` via the existing `mergePhaseResults()` (last-wins per axis, mirroring how `computedAxes` already merges). `AxisFill` is a new additive type.
- **Rationale**: `SurveyPhaseResult.computedAxes` already carries *which* axes a phase resolved; `axisFills` records *how* each was filled (source + rationale). Co-locating keeps one merge pipeline (`mergePhaseResults`) and one cumulative state (`SurveySession`). Additive optional field → non-breaking, no `Pattern` schema impact (Article I unaffected).
- **Alternatives considered**: (a) A sibling `AxisProvenance` object hung off `SurveySession` only — rejected because phase-local provenance would be lost on re-merge and harder to test per phase. (b) Mutating `DiscoveryAxisVector` to carry provenance inline — rejected: that type is the locked decision-tree input consumed by `selectStrategy()`; polluting it risks the strategy contract.

## R2. How is the autonym sourced? langtags.json is assumed but not loaded. (FR-003)

- **Decision**: Build a new `packages/engine/src/langtags/` loader that resolves a BCP47 tag to `{ localname, localnames[] }`. Pin a langtags.json version in a `scripts/langtags-version.json` (SHA-256), fetch it at `prebuild` into bundled reference data exactly as `fetch-kmcmplib` / the CLDR v46.1.0 pin already do. The autonym proposer queries langtags first, falls back to the existing CLDR exemplar loader's locale display name (`character-discovery/cldr.ts`), then to a hinted prompt.
- **Rationale**: The spec's Assumption that "langtags.json is already loaded" is **incorrect against the current code** — only a declarative `options_source: "@langtags_iso639"` reference exists (`survey/questions/a/iso_code.ts`), unresolved in v1. langtags covers minority-language autonyms CLDR omits (the spec's own stated reason for source order). The pinned-fetch pattern is already the house convention for external reference data, so this adds no new infrastructure shape.
- **Alternatives considered**: (a) CLDR-only autonym — rejected per spec (coverage gap for minority languages). (b) Bundling a full langtags.json copy in-repo unpinned — rejected: drifts silently, violates the pinned-source convention. (c) Live fetch at authoring time — rejected: Article V forbids authoring-time external dependence for a core proposal; pinned-at-build keeps proposals deterministic and offline-capable.

## R3. How does a proposal reach the field, and how is provenance shown? (FR-001, FR-010)

- **Decision**: Proposals reach fields through the **existing** `SurveyRunner.getSeedValue(questionId) → string | string[] | undefined` channel (`packages/studio/src/survey/SurveyRunner.tsx`), which already implements the exact "Default once, then user owns it" contract the spec wants. Provenance travels a **parallel** lookup (`getProvenance(questionId) → ProvenanceLabel | undefined`) rendered beside the field by `QuestionField.tsx` reusing the `LintChip` severity/badge visual vocabulary at an `info`/`hint` band.
- **Rationale**: `getSeedValue` already satisfies "seed the field, user can override in place, Back re-fires the seed" — nothing to invent for the value path. Keeping provenance a sibling channel avoids touching the locked `PatternQuestion` schema (Article I) and the studio-local `FlowQuestion` stays minimal. `PlacementCandidate.priorSource` + `confidence` (`contracts/src/placementMap.ts`) is the proven precedent for how a proposal advertises its source and confidence.
- **Alternatives considered**: (a) Adding `proposal`/`provenance` fields onto `FlowQuestion` — viable (FlowQuestion is studio-local, not a contract) but rejected as the *primary* mechanism because proposals are computed per-session from the working copy, not static question metadata; a runtime adapter is the right home. (b) A new bespoke field component — rejected in favor of reusing `LintChip` so the visual language is consistent with validation.

## R4. What enforcement band surfaces a "blank where a source existed" defect? (FR-013)

- **Decision**: The defaults-audit is a **phase-exit** function (`proposers/audit.ts`) that compares the proposals a phase *could* have produced against what the author actually left blank, and emits `LintFinding[]` at the `warning` severity (the yellow band, `#f39c12` in `LintChip.tsx`). The studio blocks/flags phase exit on these the same way it surfaces yellow checks today — no new severity, no new timer.
- **Rationale**: FR-013 explicitly asks for "the same band as a yellow check." `LintFinding` + `LintChip` already render exactly that band; running the audit at phase transition (not in the 300 ms debounce) keeps Article IV intact (no second debounce timer, no parallel validation path).
- **Alternatives considered**: (a) Folding the audit into the debounce validator — rejected: violates the single-debounce invariant and conflates per-keystroke KMN validity with phase-completeness. (b) A new severity level — rejected: the spec pins it to the existing yellow band.

## R5. Provenance vocabulary (ProvenanceLabel sources)

- **Decision**: Enumerate the source discriminant from the spec's Key Entities: `base | corpus | axis-fill | cldr | langtags | authenticated-identity | region | derived-from-axis | hinted-prompt`. Each label carries a human-readable rationale string and (where applicable) a `confidence` number, mirroring `PlacementCandidate`.
- **Rationale**: These are exactly the sources the spec's "Provenance label" Key Entity lists, plus `hinted-prompt` for the FR-012 no-default case. Aligning the enum with the existing `PlacementCandidate.priorSource` values (`corpus`, `phonetic`, decomposition/name/look-alike) lets placement and identity/help proposals share one provenance UI.
- **Alternatives considered**: A free-form string label — rejected: a closed enum is testable (SC-003 "no proposal without a provenance label") and lets the audit assert coverage.

## R6. Phase F help skeleton vs. LLM narrative split (FR-009)

- **Decision**: `proposers/help-skeleton/` deterministically builds the title, language/autonym line, and the **character→keystroke table** from `confirmedInventory` + the §7.7 `MechanismAssignment` map (using `effectiveMechanisms()`); this ships standalone. The optional `@keyboard-studio/llm` client embellishes only the surrounding narrative prose; if no backend is configured, the narrative step is skipped and the skeleton stands alone.
- **Rationale**: The keystroke table is derivable exactly from data the studio already holds — keeping it deterministic guarantees SC-004 (table matches the assignment map exactly) and keeps hallucination out of shipped how-to-type instructions. The LLM client exists (`packages/llm`) but is **not yet wired into the survey**, so "no backend" is literally today's default path — the skeleton-alone case is the baseline, not a fallback bolt-on.
- **Alternatives considered**: LLM-generated full help body — rejected by FR-009 (keystroke instructions MUST NOT be model-generated).

## R7. Phase C′ reorder proposal reuse (FR-007)

- **Decision**: The reorder proposer reuses `deriveScriptPrefill()` (`packages/studio/src/lib/scriptAxes.ts`) for script class (A2) + routing group and the §9 family sub-routing that already governs which reorder patterns appear, ranking the family's convergent reorder first with `derived-from-axis` provenance. Where a family has no single convergent reorder, it emits ranked candidates with **no forced pre-selection** (edge case) rather than asserting one.
- **Rationale**: The detection logic already exists and is the source of truth for routing; the proposer adds ranking + provenance, not new script knowledge. Honors the spec's "never silently override an abugida/abjad convention."
- **Alternatives considered**: New script-family table in the proposer — rejected as duplication of `scriptAxes.ts` / §9 routing.

## R8. Copyright "you / organization" structured choice (FR-002)

- **Decision**: The copyright proposer drives the existing `pa_copyright_holder` question (`survey/questions/a/pa_copyright_holder.ts`) as a structured choice: the *you* branch seeds the authenticated GitHub OAuth display name (then a `language-community representative` provenance record from `KeyboardProvenance`, then a hinted prompt); the *organization* branch shows a hinted free-text field. The submitter identity is never auto-asserted as holder.
- **Rationale**: The question module and the `KeyboardProvenance` representative field already exist; the proposer supplies the branch-conditional seed + provenance. Auth identity is available only on the GitHub-OAuth path (ZIP path → representative → hint, per the edge case).
- **Alternatives considered**: Silent pre-fill of OAuth identity as holder — rejected by FR-002 (must not assert submitter as holder without confirmation).

## Resolved unknowns summary

| Technical Context unknown | Resolution |
|---|---|
| `axisFills` placement | Optional field on `SurveyPhaseResult`, merged via `mergePhaseResults` (R1) |
| langtags loading (assumed, absent) | New pinned loader, CLDR-pattern prebuild fetch (R2) |
| Proposal → field channel | Existing `getSeedValue` + parallel provenance lookup (R3) |
| FR-013 enforcement band | Phase-exit audit → `warning` `LintFinding`, no new timer (R4) |
| Provenance vocabulary | Closed enum aligned to `PlacementCandidate.priorSource` (R5) |
| Help skeleton vs. LLM | Deterministic skeleton standalone; LLM narrative optional (R6) |
| Reorder proposer | Reuse `deriveScriptPrefill` + §9 routing (R7) |
| Copyright structured choice | Drive existing `pa_copyright_holder`, branch-conditional seed (R8) |

No remaining `NEEDS CLARIFICATION`.
