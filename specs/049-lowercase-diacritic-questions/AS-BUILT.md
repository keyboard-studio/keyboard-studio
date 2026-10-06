# Spec 049 Lowercase diacritic questions: as built

**Status:** Retired 2026-09-29. Shipped in PR #1358 (squash `1a6bfcd1`, 2026-07-24). Tasks: 12/12 complete.
**Full docs:** [specs/_archive/049-lowercase-diacritic-questions/](../_archive/049-lowercase-diacritic-questions/) (spec, plan, tasks, research Decisions 1-3, data-model, contracts/ui-contract.md). Not read by default.
**Pinned here:** none

## What shipped
- The marks-series survey questions offer only the lowercase (or caseless) base of each case pair when the alphabet is cased; an uppercase base is hidden only when its lowercase counterpart is present in the confirmed bases.
- Uppercase attachments are still recorded, with no extra question: checking a lowercase base also checks its present uppercase counterpart.
- Caseless scripts, and letters with no single-character counterpart, are untouched.
- The "capitals follow automatically" count reflects the displayed lowercase list.

## Public contracts
- `packages/studio/src/survey/charNormUtils.ts` (shared casing fold, used by both `PhaseB.tsx` and `survey/marks/MarksSeriesStep.tsx`): `hiddenUppercaseBases(bases, bcp47?): Set<string>` (line 135), `lowercaseBaseView(bases, bcp47?): string[]` (148), `casedBaseCount(bases, bcp47?): number` (158).
- `packages/engine/src/marks/case-fold.ts`: `expandCaseCounterpartAttachments(alphabet, attachments, bcp47?)` returns a new map, additive only, never clears a check. Re-exported from `packages/engine/src/index.ts:519`. Also used in `packages/studio/src/hooks/useWorkToDo.ts`.
- Reused, unchanged: `caseCounterpart(char, bcp47?)` in `packages/engine/src/character-discovery/casePair.ts`. No `@keyboard-studio/contracts` type changes.

## Key decisions
- Casing signal is the per-letter `caseCounterpart` fold shared with the character step, not an IR casing facet (spec 048 had no landed code); the shared helper is the seam to switch when the facet lands (Decision 1).
- Uppercase expansion is a new pure engine helper reusing `caseCounterpart`, introducing no new casing rule (Decision 2).
- Affordance count is computed from the displayed lowercase view (Decision 3).

## Gotchas and limits
- An uppercase with no present lowercase stays visible; folding is per-letter, so a cased alphabet missing a lowercase is not fully folded.
- The recorded marks/attachment data is unchanged in shape (FR-007); downstream consumers see the uppercase attachments as before.
- docs/carve-marks-needed-set.md describes how the marks decisions feed carve.

## Divergences from the spec
- FR-006 says the signal should be the IR casing facet (spec 048). Code uses the shared `caseCounterpart` fold instead. Intentional and recorded in research Decision 1; not a bug.
- FR-002 says "reusing `deriveCaseCounterparts`"; the code added `expandCaseCounterpartAttachments` instead.

## Follow-ups and open issues
- If the IR casing facet lands, repoint `charNormUtils.ts` helpers at it.
- Citations to fix at the stub: [docs/carve-marks-needed-set.md](../../docs/carve-marks-needed-set.md) links the folder (still resolves); specs 052 and 074 link `../049-.../spec.md` (now archived).
