# Phase 0 Research: Langtags-driven identity autocomplete

All spec-level ambiguities were resolved in the `/speckit-clarify` session (FR-013/014/015). This document captures the **implementation-approach** decisions and their rationale.

## R1 — Does langtags carry the multi-name / region data we need?

**Decision**: Extend the codegen to retain `names[]`, `localnames[]`, and `regionname` from the SIL langtags source; the current slim index deliberately drops them.

**Findings**:
- `scripts/codegen-langtags.mjs` currently destructures only `{ full, iso639_3, iso639_3extra, localname, name, regions }` per entry and emits a single `autonym` (from `localname`) + single `englishName` (from `name`) + `regions[]` (region codes).
- The SIL langtags `source/langtags.json` schema carries, per tagset, both the singular `name`/`localname` **and** the arrays `names` (alternate English/other-language names) and `localnames` (alternate own-script names), plus `region` (code) and `regionname` (country name), and multiple tagsets can share a bare subtag while differing by `region`/`script`.
- The raw file is **not** checked in (gitignored under `packages/engine/data/langtags/`, fetched + SHA-verified by `fetch-langtags` at prebuild). Therefore a build-time verification step (inspect the fetched data at the pinned commit `99b856b` to confirm `names`/`localnames`/`regionname` coverage and multiplicity) is an explicit task, not an assumption.

**Rationale**: The feature's "choice of local names" (FR-004) and region disambiguation (FR-014) require data the slim index currently discards. Retaining the arrays at codegen time keeps the runtime lookup pure (no raw-file parsing in the browser).

**Alternatives considered**: (a) parse the raw langtags.json at runtime — rejected: bloats the browser bundle and violates the slim-index design; (b) a second fetched dataset — rejected by FR-012 (single pinned source).

## R2 — Codegen extension shape

**Decision**: Emit, per language subtag, the primary `englishName`/`autonym` (unchanged, for back-compat) **plus** `englishNames: string[]`, `localNames: string[]`, and a `regionVariants` list (one entry per region-distinct tagset: `{ region, regionName, autonym, localNames, script }`). Keep the existing fields so current consumers (`getLanguageDefaults`, script seeding) are unaffected.

**Rationale**: Additive shape → no breaking change to existing langtags consumers; the new arrays/variants power the autocomplete, local-name picker, and region disambiguation. `regionVariants.length > 1` is the exact FR-014 ambiguity trigger.

**Alternatives considered**: replacing singular fields with arrays — rejected: needlessly breaks existing callers and the `LanguageDefaults` contract's current shape.

## R3 — `LanguageDefaults` / `LanguageSummary` contract extension

**Decision**: Add optional array fields (`englishNames?`, `localNames?`, `regionVariants?`) to `LanguageDefaults` and the search-result `LanguageSummary` in `packages/contracts/src/langtags.ts`. Update any co-located zod schema / drift guard in the same change (house rule; these are NOT the locked `Pattern` contract, so no major version bump is triggered).

**Rationale**: Optional/additive keeps the change backward-compatible and within the additive-member allowance; satisfies Article I's "update the schema in the same change" for non-Pattern types.

## R4 — English-name autocomplete (Q1) mechanism

**Decision**: Reuse the existing `autocomplete` question type + `options_source: "@langtags_iso639"` (already used by `il_language_code`) and the `searchLanguages`/`lookupByName` backend, but drive/display the **English name** and resolve the entry (tag + script + local names + region variants). Free-text preserved (FR-013).

**Rationale**: The autocomplete primitive, the langtags-backed picker, and free-text passthrough already exist — this is promotion + wiring, not new UI infrastructure.

**Alternatives considered**: a brand-new autocomplete component — rejected: duplicates existing `QuestionField`/Autocomplete behavior.

## R5 — Region-disambiguation question (conditional)

**Decision**: Add a new `il_language_region` question module, shown only when the resolved entry has `regionVariants.length > 1`. Its options are the variants' `regionName`s; selecting one narrows the resolved variant, which drives Q2's local-name choices and the BCP47 region subtag. Conditional routing via `definition.next` returning a goto-rule (the flow already supports `FlowGotoRule[]` in `next`) so the region step is skipped when unambiguous. Skipping falls back to the primary variant (FR-014, never blocks).

**Rationale**: Matches the modular flow's routing model (routing lives in `next`); keeps the region step out of the common (unambiguous) path.

**Open implementation detail (for /speckit-tasks)**: exactly where the "resolved entry" and "selected variant" live across questions — mirror the existing `IdentityLite.tsx` ref pattern (`autonymRef`, `languageCodeRef`, `scriptSeedRef`) with a `resolvedEntryRef` / `selectedVariantRef`.

## R6 — Local-name multi-choice (Q2) + seeding rework

**Decision**: Q2 (`il_language_autonym`) becomes an `autocomplete`/datalist seeded with the resolved variant's `localNames[]` as options, free-text override preserved. The current autonym→English `getSeedValue` seeding is **inverted**: the resolved entry (from Q1) seeds Q2's options and Q3's code, rather than the autonym seeding English.

**Rationale**: The new resolution direction (English name → entry → names/code) is the whole point of the redesign; the old seed direction is obsolete.

**Risk/mitigation**: The Back-edit re-seed contract (FR "back-edit" edge case) must be preserved — SurveyRunner's "seed on first arrival, never overwrite a user value" rule already covers this; the ref-based re-resolution mirrors the existing script-seed pattern.

## R7 — Language-code confirmation (Q3)

**Decision**: Keep `il_language_code` as the final identity step but **auto-filled** from the resolved entry's tag (via `getSeedValue`), moved to after the names. It still drives `IdentityLiteResult.bcp47` (assembled from code + script + region — FR-011). Free-text/blank still allowed for unmatched languages.

**Rationale**: Option (b) from the design discussion; preserves author control over the tag without forcing manual entry.

## R8 — Test/snapshot impact

**Decision**: Update order-asserting artifacts (`flow-parity` snapshot, `loadModularFlow`, `buildStepGraph`, `stepHost` golden-walk) and add/adjust question-module fixtures for the reordered flows and the new region module. New unit tests for the extended langtags index (multi-name + region-variant retrieval).

**Rationale**: These artifacts pin flow order and question membership; the reorder + new module necessarily changes them. Snapshot updates are mechanical once behavior is correct.

## T008 — Data verification results (pinned langtags `99b856b`, 9600 records)

Ran against the fetched `packages/engine/data/langtags/langtags.json`:

- **Field coverage** (of 9600 records): `name` 9596, `names[]` **8243**, `localname` 1990, `localnames[]` **3313**, `regionname` **9497**, `regions[]` 2069, `script`/`region` 9596. → the data carries everything the feature needs (R1 confirmed).
- **Region variants are rare**: of **7898 distinct bare subtags**, only **205 (2.6%)** have >1 distinct `regionname` across their entries. The FR-014 region prompt is a genuine minority path — matches the "ask only when ambiguous" design.
- **NEW finding — homonym languages (spec gap)**: **98 English `name` strings map to >1 distinct subtag** (different languages sharing an English name, e.g. `Ainu`→{`aib`,`ain`}, `Karo`→{`arr`,`kxh`}, `Aja`→{`aja`,`ajg`}). This is **not** a region variant of one language, so the FR-014 region question does not resolve it. It must be disambiguated **in the autocomplete suggestion list** (show region/ISO code alongside the English name so duplicate-named languages are distinguishable). → `LanguageSummary` MUST carry `region`/`regionName` (and expose the subtag it already has) so the picker can render distinct suggestions. Recorded as a US1 refinement; foundational types updated to support it.
- **Local names are sparse**: only **3120/7898 subtags (39.5%)** have any local name. → for ~60% of languages Q2 has **zero** local-name choices; free-text is the common case, not the fallback (FR-005). The multi-choice UI MUST degrade cleanly to a plain free-text field when `localNames` is empty (add to US2 acceptance + Edge Cases).

**Design impact**: (a) add `region`/`regionName` to `LanguageSummary` (T002) for homonym disambiguation; (b) treat empty-`localNames` as the majority Q2 path; (c) FR-014 region prompt stays as specced but is confirmed rare. No blocker — the feature is buildable as planned with these refinements.

## Summary of decisions

| # | Decision |
|---|---|
| R1 | Retain `names[]`/`localnames[]`/`regionname` in codegen; verify against fetched pinned data (task). |
| R2 | Additive slim-index shape: keep primary fields + add `englishNames[]`/`localNames[]`/`regionVariants[]`. |
| R3 | Additive optional fields on `LanguageDefaults`/`LanguageSummary` + schema update (non-Pattern, no version bump). |
| R4 | Reuse existing autocomplete + langtags backend for the English-name Q1. |
| R5 | New conditional `il_language_region` module; shown only when `regionVariants.length > 1`. |
| R6 | Q2 multi-choice local names + free-text; invert the seeding direction. |
| R7 | `il_language_code` becomes an auto-filled confirmation step; assembles BCP47 from code+script+region. |
| R8 | Update flow-order snapshots/tests; add langtags-index + region-module tests. |
