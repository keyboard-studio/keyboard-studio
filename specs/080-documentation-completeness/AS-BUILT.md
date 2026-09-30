# Spec 080 Documentation Completeness: as built

**Status:** Retired 2026-09-29. Shipped in PR #1768 (squash `93d2e5ec`, 2026-09-25); human decisions A, B and C applied in #1829 (`8f4e9f7c`). Tasks: 79/79 complete.
**Full docs:** [specs/_archive/080-documentation-completeness/](../_archive/080-documentation-completeness/) (spec, plan, tasks, research, data-model, quickstart, four contracts, checklists). Not read by default.
**Pinned here:** none. `contracts/help-header.md` is the format source for the help header, but only source comments cite it; the code (`packages/engine/src/shared/packageDocs.ts`, `helpSiteHeader`) is the truth.

## What shipped
- Every produced package carries six documentation members: `README.md`, `HISTORY.md`, `LICENSE.md`, `source/readme.htm`, `source/welcome/welcome.htm`, `source/help/<id>.php`. Regenerated on every production.
- Welcome page uses the corpus folder convention, with its images listed in the descriptor; a fresh help page starts with the standard help-site header.
- Base documentation is classified none, minimal or full at base selection, and the help-docs description question adapts to it.
- A proposed first HISTORY entry from the recorded changes, with a confirm, edit or dismiss surface.
- Deterministic per-layer SVG layout charts under the welcome folder.
- An informational documentation checklist on the Output step showing each member's source tier.
- Thirteen Layer C documentation warnings (never blocking download or submission).

## Public contracts
- Engine, `packages/engine/src/`: `renderLayoutCharts(input)` and `layoutChartFilename` (`layout-chart/`); `extractWelcomeImageRefs`, `renderHelpPhp`, `renderWelcomeHtm`, `renderReadmeMd`, `renderReadmeHtm`, `renderWelcomeLayoutSection` (`shared/helpDocsRender.ts`); `helpSiteHeader`, `helpSitePageName`, `helpPhpStub` (`shared/packageDocs.ts`); `deriveDocMemberStates` (`shared/deriveDocMemberStates.ts`); `renderHistoryMd` (`shared/renderHistoryMd.ts`); `buildHistoryProposal` (`decision-audit/historyProposal.ts`); `classifyBaseDocumentation` (`base-browser/classifyBaseDocumentation.ts`).
- Help header shape: `<?php $pagename = '<Display Name> Keyboard Help'; $pagetitle = $pagename; require_once('header.php'); ?>` followed by an HTML fragment with no wrapping html/body (criterion 11.4). If the display name already ends in "Keyboard", the suffix is "Help" only. Display name is PHP-single-quote escaped.
- Studio: `useBaseDocProfile` (`hooks/`), `DocumentationChecklist.tsx` on `OutputScreen`, working-copy slice `chartPreference` (`stores/workingCopyStore.ts`), `buildHistoryProposalSeed` (`decisions/historyProposalSeed.ts`), Phase F question `pf_history_entry`.
- Layer C: twelve modules `packages/keyboard-lint/src/checks/docs/check-*.ts` emitting 13 existing `lintRuleId` codes (3.3-3.7, 4.7, 5.7, 7.1, 11.5, 11.6, 11.7, 11.9, 11.10), all `severity: "warning"`, `layer: "C"`. `criteria.json` was not edited.
- `utilities/welcome-sweep/run.mjs`: the offline SC-002 corpus sweep (imports engine dist; build the engine first).

## Key decisions
- Charts are SVG from a pure engine module fed by contracts types, never screenshots; output is byte-deterministic (R1, R2, R12).
- The three hard-coded flat-welcome sites were migrated to the folder convention together (R3).
- Base classification uses the already-fetched `.kps` plus one probe fetch (R4).
- Source tier (derived, inherited, authored) is a pure derivation plus persisted author state, so the checklist has one authority (R5, FR-022).
- Layer C checks are dependency-free string scanners wired through a memoized studio hook; no new timer, so D3 holds (R7).
- Track 1 copies inherit only images and page skeleton, never the base's prose (R9, FR-007).
- Decision A: HISTORY parser reads ATX and setext headings, new entries stay ATX, inserted after any leading Change History preamble. Decision B: fresh help.php is header plus fragment only, and 11.9 normalization strips html, head and body. Decision C: one engine helper (`comboToTouchLayerId`) yields layer ids for both charts and Layer C, so chart filenames do not depend on `.kvks` presence.

## Gotchas and limits
- The tag-balance scanner for 11.5 is deliberately not `DOMParser` (module header documents the deviation).
- `<html lang>` applies to `welcome.htm` and inherited help pages that already have an html element; a fresh help page has none.
- Documentation findings already in a base's own files are shown as upstream (muted) findings (FR-020).
- The corpus sweep reports base defects as `[WARN]` notes, not failures.

## Divergences from the spec
- The archived help-header contract was edited in #1829 to the fragment-only form; the spec's older wording about a bare wrapper document no longer applies. None other found: all exports named in `contracts/engine-api.md` exist at the paths above.

## Follow-ups and open issues
- Stale doc links to repoint at this stub: utilities/welcome-sweep/README.md:5 and docs/keyboard-documentation-plan.md:14 link `spec.md`; docs/tooling.md:422 links the folder (still resolves).
- Source comments citing `contracts/*.md` or `research R6` (for example `historyProposalSeed.ts:3`, `persistWorkingCopy.ts:228`) now point into the archive.
