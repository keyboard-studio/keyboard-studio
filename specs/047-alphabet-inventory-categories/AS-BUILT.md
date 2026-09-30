# Spec 047 Alphabet inventory categories: as built

**Status:** Retired 2026-09-29. Shipped in PR #1346 (squash `05512646`, 2026-07-24). Tasks: 30/30 complete.
**Full docs:** [specs/_archive/047-alphabet-inventory-categories/](../_archive/047-alphabet-inventory-categories/) (spec, plan, tasks, research Decisions 1-6, data-model, contracts/ui-contract.md, checklists). Not read by default.
**Pinned here:** none

## What shipped
- Phase B "Add your whole alphabet" captures every distinct grapheme typed or pasted (no space-separation needed); only CR, LF, CRLF, Tab and space are dropped.
- The alphabet breakdown gains Numbers, Punctuation, Symbols, Separators and Control/other sections beneath Letters / Marks / Accented letters. Each shows only when non-empty; every character lands in exactly one section.
- Letters shows lowercase of each case pair by default; a "Show uppercase letters" toggle reveals derived uppercase (display only).
- On Done, `confirmedInventory` records the full inventory plus each cased letter's locale-correct uppercase counterpart.
- The "Your alphabet" chip list shows only letters, marks and letter+mark combos.
- Multi-code-point chips get a `U+<first>+` label with the full stack as title/accessible name.

## Public contracts
- `packages/engine/src/character-discovery/glyphCategory.ts`: `type GlyphCategory = "letter"|"number"|"punctuation"|"symbol"|"separator"|"control"` and `glyphCategory(char)`. Precedence L, N, P, S, Z, else control (total). Marks and private-use are the caller's concern (`phaseBDraftStore` routes them first).
- `packages/studio/src/survey/collation.ts`: `collate`, `collateCompare`, `collateInventory`, `codePointCompare`, `loanwordsLast`. Section ordering is the default ICU collator; the picker's Unicode-value ordering is unchanged.
- `packages/studio/src/survey/codepointLabel.ts`: `codepointLabel(grapheme): CodepointLabel`.
- UI testids (in `PhaseB.tsx`): `alphabet-letters|marks|accented|numbers|punctuation|symbols|separators|controls`, `letters-uppercase-toggle`. Heading id `survey.phaseB.charChipEditor.count` shows the filtered (linguistic) count.
- Category split is computed once in `phaseBDraftStore.deriveStores()`.

## Key decisions
- Additive to the confirmed-alphabet data: non-letters stay recorded, only hidden from the chip list (FR-011/FR-013, Decision 2).
- Native Unicode property escapes rather than a UCD table, matching the engine's existing `isCombiningMarkChar` style (Decision 3).
- Case pairing reuses the engine's `caseCounterpart(char, bcp47)`; caseless scripts and cased letters with no counterpart are left untouched (FR-010, Decision 5).

## Gotchas and limits
- Unusual invisibles (e.g. NBSP) are kept and surfaced under Control/other, not silently dropped.
- Spec 051 later added cased-letter pairing for carve on top of the same counterpart idea; spec 044 supplies the exemplar tiers that feed the auxiliary/punctuation/numbers sections.

## Divergences from the spec
None found (exports, testids and `U+..+` label spot-checked at origin/main).

## Follow-ups and open issues
- No deferred tasks. Source comments cite `specs/047-alphabet-inventory-categories` in `glyphCategory.ts`, `codepointLabel.ts`, `collation.ts`; they still resolve to this stub folder.
