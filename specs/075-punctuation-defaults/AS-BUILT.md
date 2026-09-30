# Spec 075 Punctuation Defaults: as built

**Status:** Retired 2026-09-29. Shipped in PR #1769 (merge commit `a18bb8dc`, 2026-09-21), preceded by spec-only PRs #1758 and #1763. Tasks: 60/60 complete.
**Full docs:** [specs/_archive/075-punctuation-defaults/](../_archive/075-punctuation-defaults/) (spec, plan, tasks, research, data-model, contract). Not read by default.
**Pinned here:** none (docs/architecture.md:95 links `spec.md` as a descriptive pointer, not a format reference; `manifest.ts` `specRef` strings point at the folder, which still exists).

## What shipped
- The punctuation spine step now starts from a proposed list: the locale's CLDR/SLDR punctuation tier plus the punctuation the base keyboard already produces, shown as two disjoint groups.
- When base coverage cannot be determined, only the 32-character basic-ASCII floor stands in, under a distinct "incomplete" caption. Floor and known set are never mixed.
- A "still missing" count for the chosen inventory (`computeInventoryDelta` gets its first production caller).
- A new always-rendering spine step `invisibles`: format characters (ZWJ, ZWNJ, ZWSP, soft hyphen, word joiner, plus bidi controls for RTL authors) are offered by name with a need statement; yes/no is a recorded decision.
- The old RTL direction-mark questions were subsumed and deleted; a format character typed on the punctuation page is handed off to the invisibles step.
- A draft-restore fix: `applyEnvelopeToStores` now restores the full Phase B draft snapshot.

## Public contracts
- Engine, `packages/engine/src/character-discovery/punctuationProposal.ts` (exported from the engine root barrel): `ASCII_PUNCTUATION_FLOOR`, `basePunctuationCoverage(ir)`, `buildPunctuationProposal({ exemplars, baseCoverage, rejected, authorChosen })` returning `{ cldrGroup, baseGroup, cldrAbsentReason?, baseCoverageIncomplete }`. `hasUnaccountedOpaqueFragment(ir)` is now exported from `packages/engine/src/inventory/computeInventoryDelta.ts`.
- Draft store `packages/studio/src/stores/phaseBDraftStore.ts`: `DraftProvenance` gains `"base"` and `"ascii-floor"`; sticky `seededProposals: string[]` and `invisibleDecisions: Record<"U+XXXX", "accepted"|"declined">`; actions `seedProposals(chars, source, seedKey)`, `acceptInvisible`, `declineInvisible`, `adoptControlsAsInvisibles`. Both fields survive `reset()`, clear only through `resetPhaseBDraftDecisions()`, and round-trip through the snapshot.
- `packages/studio/src/survey/phaseCInventory.ts`: `phaseCConfirmedInventory()` (union of punctuation slice and accepted invisibles); both steps emit `{ phase: "C", confirmedInventory }` from it and never touch the phase-B result.
- Steps in `packages/studio/src/steps/manifest.ts`: `punctuation` and `invisibles`, both `inputs: []`, `writes: []`, `persistence: "phase-b-draft"`. Candidate list: `survey/invisibles/invisibleCandidates.ts`.
- Test ids: `cldr-punctuation-group`, `base-punctuation-group`, `punctuation-missing-count`, `punctuation-handoff-note`, `invisibles-continue`; i18n ids under `survey.punctuation.*` and `survey.invisibles.*`. No `packages/contracts` change.

## Key decisions
- Seed through a store action (`seedProposals`) keyed once per source, not a component effect loop; it honours `rejected` and never downgrades `"author"` (D-01).
- The "completed before" signal for not re-seeding is an existing phase-C `confirmedInventory` (D-02, FR-023).
- Provenance stays single-valued; "also produced by the base" is derived at render (D-04).
- Both phase-C emitters emit the same union so neither clobbers the other (D-06).
- Invisible decisions are a sticky draft record (D-07); carry-over migrates existing `\p{Cf}` controls into accepted decisions (D-09).
- The invisibles step always renders, with no computed gate; its e2e driver waits plainly instead of racing (D-14, SC-009).
- Carve's always-keep rule for `\p{N}\p{P}\p{S}` is surfaced in a caption, not changed (D-15).

## Gotchas and limits
- A declined punctuation character can still be re-admitted by carve's always-keep rule; `punctuationOutputParity.test.ts` names such cases so the deferred carve-side concern stays visible.
- The `pb_rtl_direction_marks*` modules are deleted and `pb_rtl_short_vowels.next` rewired; the Phase B flow-edge snapshot and Tier B catalogs were regenerated, so a flow change must regenerate them again.
- Base group shows the floor only when coverage is unknown (opaque fragments); otherwise it shows exactly what the IR produces.

## Divergences from the spec
None found. Every pinned identifier in the contract (exports, store fields, testids, step ids and declarations) exists in the code at `origin/main`.

## Follow-ups and open issues
- Teaching carve to honour a declined punctuation set is a separate carve feature (D-15).
- Stale doc link: docs/architecture.md:95 links this folder's `spec.md`; repoint at AS-BUILT.md.
