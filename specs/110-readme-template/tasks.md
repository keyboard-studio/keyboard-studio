# Tasks: spec 110 — README template driven by authoring choices

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md)

## Phase 1: Engine — facts type, forms, renderers (US1, US2, US3, US4, US5)

- [x] T001 [US1] Add the `ReadmeFacts` type and `extractReadmeDescription()` in `packages/engine/src/shared/readmeFacts.ts`. Export both from `packages/engine/src/index.ts`.
- [x] T002 [US1] Rewrite the `readmeMd` and `readmeHtm` forms in `packages/contracts/data/doc-forms.json` to the spec 110 section order (FR-001 and FR-009).
- [x] T003 [US1] Make the following changes in `packages/engine/src/shared/helpDocsRender.ts`:
  - add `HelpDocsRenderInput.readme?: ReadmeFacts`;
  - have `renderReadmeMd` and `renderReadmeHtm` render the facts;
  - drop the inherited-README append (FR-011);
  - use the `fallbackDescription` (US5).
- [x] T004 [US1] Render tests in `packages/engine/src/shared/helpDocsRender.test.ts`. They cover:
  - section order and omission;
  - escaping;
  - the readme.htm exclusions;
  - "… and N more" truncation;
  - no placeholders;
  - facts agreeing between README.md and readme.htm;
  - description fallback.

## Phase 2: Studio — build and wire the facts

- [x] T005 [US1] Add a pure `buildReadmeFacts(input)` in `packages/studio/src/lib/readmeFacts.ts`. It covers:
  - characters;
  - removed characters;
  - typing rows (capped at 8, one per method first);
  - literal-trigger rows;
  - composition;
  - the font flag;
  - use-case phrase;
  - language entries;
  - based-on;
  - design notes (at most 6).
- [x] T006 [US1] Add `packages/studio/src/lib/readmeFacts.test.ts`, using the `docContent.fixtures.ts` fixtures.
- [x] T007 [US3] Add `readmeFactsInputFrom()` in `readmeFactsInput.ts`, which reads the decision store and the working copy. Both the projection and the preview use it.
- [x] T008 [US5] Wire `serializeWorkingCopy.ts` to pass `readme` facts. Track 2 regenerates, with the `.kps` and README description fallback.
- [x] T009 [US4] Wire `useDocsPreview.ts` the same way (FR-012).
- [x] T010 Update the existing tests that assert the old README shape (projection, preview, keyboard-lint fixtures if any).

## Phase 3: Governance and cleanup

- [x] T011 Record the amendment notes in spec 102 (FR-029 and User Story 4) and in the spec 080 AS-BUILT (FR-006), with pointers to spec 110.
- [ ] T012 (deferred: the scaffolder stub and an engine test still use them; a follow-up) Retire the legacy `readmeMd` and `readmeHtm` in `packages/engine/src/shared/packageDocs.ts` if only the scaffolder stub uses them. Point the scaffolder at the new renderers or a minimal stub.
- [x] T013 Gates: `pnpm typecheck`, the affected package tests, and `pnpm lint`.
