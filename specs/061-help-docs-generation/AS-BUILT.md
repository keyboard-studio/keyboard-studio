# Spec 061 Help docs generation: as built

**Status:** Retired 2026-09-29. Shipped in PR #1585 (squash `3bc73b7b`, 2026-08-10). Tasks: 35/35 complete.
**Full docs:** [specs/_archive/061-help-docs-generation/](../_archive/061-help-docs-generation/) (spec, plan, tasks, research D-01..D-11, data-model, contracts, checklists). Not read by default.
**Pinned here:** none. No file under the folder is read by code or linked as a format reference; checked `utilities/`, `scripts/`, `packages/`, `docs/`.

## What shipped

- Phase F documentation answers now drive the shipped documentation files: `README.md`, `source/readme.htm`, `source/welcome.htm`, `source/help/<keyboardId>.php`.
- Adaptation merges the copied keyboard's existing welcome and help text with the author's answers instead of overwriting it.
- The author's project home URL lands in the `.kps` as `<Info><WebSite>`.
- A live docs preview panel in the studio shows the generated output before download.
- An opt-in "additional detail" battery of Phase F questions appends sections in a fixed order.

## Public contracts

- `packages/contracts/src/help-docs.ts`: `HelpDocsAnswers { description; usageTips: string[]; credits?; contactInfo?; projectHomeUrl?; projectHelpUrl?; docLanguage?: "english" | "target" | "bilingual" (legacy, no longer written); docLanguageTags?: string[] (1-2 BCP 47 tags, main language first); designRationale?; fontGuidance?; canonicalOrder?; scriptGlossary?; exampleWords?; scopeVariety?; provenanceBasis?; troubleshooting?; knownLimitations?; relatedKeyboards?; furtherReading? }`, with `HelpDocsAnswersSchema` mirror in `schemas.ts` (drift-guarded). Only `description` is required.
- `packages/studio/src/stores/workingCopyStore.ts`: `helpDocs`, `baseWelcomeHtmText`, `baseHelpPhpText` (all default `null`); `setHelpDocs(helpDocs | null)` is whole-value replace, like `setAttribution`.
- `packages/engine/src/shared/helpDocsRender.ts`: `buildDocSections`, `renderReadmeMd`, `renderReadmeHtm`, `renderWelcomeHtm`, `renderHelpPhp`, `DocSection`, `HelpDocsRenderInput`; also `renderWelcomeLayoutSection`, `extractWelcomeImageRefs`.
- `packages/engine/src/loader/fetchKeyboardSourceToVfs.ts`: result gains optional `baseWelcomeHtmText`, `baseHelpPhpText`.
- `packages/engine/src/package-descriptor/build.ts`: `PackageDescriptorIdentity.websiteUrl?`; `buildKpsContent` emits `<WebSite URL=".."></WebSite>` after `<Description>` only when non-blank.
- `packages/studio/src/lib/serializeWorkingCopy.ts` `projectWorkingCopyForOutput` writes the four VFS paths above; no new paths.
- Studio: `packages/studio/src/hooks/useDocsPreview.ts`, `components/DocsPreviewPanel.tsx`; `flowStepOptions.tsx` `phaseFOptions.onCommit` calls `extractHelpDocs` then `setHelpDocs`.

## Key decisions

- Answers live on a dedicated store field, not the `writes`/`mutate` pipe (D-01).
- One shared pure render module, not four template functions (D-02).
- Regeneration hooks into `projectWorkingCopyForOutput`, not `buildOutputBundle` (D-03), so PR and zip paths agree.
- Fallback reuses today's exact placeholder strings (D-04). Base docs must be fetched first, they were never fetched before (D-05).
- Only the home-page line feeds `.kps` `<WebSite>`; the corpus has no two-`<WebSite>` precedent (D-06).
- One escaper, `shared/escapeHtml.ts` (D-07). README is Markdown and unescaped.
- Preview is a synchronous derivation, not a second debounce cycle (D-08).
- Only `pf_usage_tip_1` and `_2` are reachable; tips 3-5 were demoted (D-11).

## Gotchas and limits

- `.htm` and `.php` must be well-formed (FR-009); free text always goes through the escaper.
- `pf_canonical_order` is gated to non-roman scripts by an existing gate.
- `docs/keyboard-documentation-plan.md` (living) describes the generated `source/help/<id>.php`.

## Divergences from the spec

None at retirement. Data-model interface and contract identifiers matched the code.

## Amendments after retirement

- **FR-006, help-page language (2026-10-08).** FR-006 originally tagged the shipped welcome and help pages with the keyboard's own primary language. It now reads: the page's declared language is the language the author says the help prose is written in, falling back to the keyboard's primary language when the author hasn't said. In code:
  - `pf_doc_language` asks for the main language: English, the keyboard's language, or another language through `pf_doc_language_other`, a langtags picker. `pf_doc_language_second` (with `pf_doc_language_second_other`) adds an optional second language, so any two of English, the keyboard's language and another language can be paired (sil_yi EN+ZH, sil_cameroon_azerty EN+FR, winchus ES alone).
  - `extractHelpDocs` resolves the answers to `HelpDocsAnswers.docLanguageTags`, main language first. `helpDocsRender.ts` `proseLang` sets `<html lang>` from the first tag. A bilingual page gets one root `lang`, not per-section spans, because each answer holds both languages in one text.
  - Compatibility: additive. `docLanguageTags` is a new optional field. `docLanguage` stays in the type and schema so saved drafts still load, and a saved `pf_doc_language` answer of `bilingual` reads as English plus the keyboard's language. No contracts version bump.

## Follow-ups and open issues

- Later spec 080 (documentation completeness) builds on this and cites it.
- `packages/studio/src/steps/manifest.specref.json`, `registerEditorSteps.ts:262` and `survey/questions/f/pf_doc_language.ts:79` carry `specRef: "specs/061-help-docs-generation"`. These resolve against the unit list in `docs/spec-trace.json`, not the filesystem, so that entry must stay (do not prune it as orphaned) or `checkSpecRef` in `dashboard/completeness.ts` will flag them.
