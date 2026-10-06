# Spec 064 Keyboard attribution and license provenance: as built

**Status:** Retired 2026-09-29. Shipped in PR #1510 (squash `424d0ede`, "Keyboard attribution (spec 059) and a minimum-friction Phase F"; the spec was renumbered 059 to 064 in #1643); Phase 4 polish closed in #1673 (`1f0d8c94`, 2026-08-24). Tasks: 38/38 complete.
**Full docs:** [specs/_archive/064-keyboard-attribution/](../_archive/064-keyboard-attribution/) (spec, plan, tasks, research D1-D9, data-model, contracts/copyright.md, HANDOFF-CONTENT.md, corpus-scan.out.txt). Not read by default.
**Pinned here:** [corpus-scan.py](corpus-scan.py) (the re-harvest script that `packages/contracts/src/fixtures/copyrightLines.ts:7` tells maintainers to run).

## What shipped
- The identity flow captures author name, optional email and a copyright holder (`il_author_name` required and prefilled from the GitHub profile, `il_author_email`, `il_copyright_holder`; blank holder means "same as author").
- One source of truth writes the holder into `LICENSE.md`, `.kmn` `store(&COPYRIGHT)` (via the IR field) and `.kps` `<Info><Copyright>`.
- Derived keyboards keep the base's copyright lines verbatim; holders are deduped, year ranges extend, lines ordered by earliest year.
- An unparseable base `LICENSE.md` blocks emission (ZIP and PR paths) unless the author types the original holder.
- Author email is published into `SurveyContext` as `author_contact`, seeding `pf_contact_info`.
- The base's `LICENSE.md` is fetched into the working copy when a copied keyboard is chosen.

## Public contracts (as the code has them)
- `packages/contracts/src/copyright.ts`: `parseCopyright(text): ParseResult` (`{ok:true,block}` or `{ok:false,reason,line}`; reasons `no_copyright_line | template_placeholder | no_holder`), `renderLicense(block)`, `addHolder`, `dedupeHolders`, `orderHolders`, `renderHolderLine`, `renderHolderLineNoYear`, `MIT_BODY`, `DEFAULT_MARKER`, `CopyrightHolder`, `CopyrightBlock`.
- `packages/contracts/src/attribution.ts`: `Attribution {authorName, authorEmail?, copyrightHolder}`, `effectiveHolder()`.
- `packages/contracts/src/scaffolder.ts`: `ScaffoldOptions.baseHolderOverride`, `ScaffoldResult.attributionMissing`; base license text carried on the fetched source (`engine/src/loader/fetchKeyboardSourceToVfs.ts:441-445`).
- `engine/src/output/github.ts`: `verifyToken` retains `name`/`email` from the existing `/user` response (no new request).
- Consumers: `engine/src/scaffolder/index.ts`, `engine/src/output/ensurePackageFiles.ts`, `studio/src/editors/adapters/panelAdapters.tsx:66` (writes `author_contact`), `flowStepOptions.tsx:281` (`CTX_AUTHOR_CONTACT`).

## Key decisions
- One free-text holder, prefilled, not per-artifact fields (D1).
- Year is emit-time, not scaffold-time (D2).
- Inherited holders precede the current author; year-less lines sort first, stably (D3).
- `LICENSE.md` is authoritative; `header.copyright` is the fallback (D4).
- Unparseable base license hard-blocks, with an entry escape hatch (D5).
- Guests must type an author name; no placeholder holder is ever emitted (D6).
- Write the IR `COPYRIGHT` field, not `.kmn` text; codec already round-trips it (D8).
- Copyright is data with pure parse/render, failure is a value never an empty block (D9, contract P1).

## Gotchas and limits
- Parser must accept `©`, `(c)`, `(C)`, single years, ranges and comma lists; must reject literal `YYYY`, underscore-run holders and holder-less lines.
- Fixtures are harvested from `../keyboards` by `corpus-scan.py`; they drift with the corpus pin.
- Only canonical MIT is emitted; there is no license detection.
- Attribution question ids/prompts are Content-owned; the modular `il_*` modules import copy from the demoted Phase A modules.

## Divergences from the spec
None found in the exports above (types, functions and the D7 retention all present). Not exhaustively re-verified: FR-003 `.kps` Copyright write path.

## Follow-ups and open issues
- HANDOFF-CONTENT.md (archived) lists Content wording items 1-4 for `il_author_name` / holder questions as never applied; item 5 (correctness guard) was applied.
- Stale citations for km-programmer: `contracts/src/copyright.ts:13` links `specs/064-.../contracts/copyright.md`; `studio/.../flowStepOptions.tsx:271` links `specs/064-.../spec.md`; both now resolve into `../_archive/`.
