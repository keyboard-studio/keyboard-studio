# Spec 026 qu-survey-session-store: as built

**Status:** Retired 2026-09-29. Shipped in PR #976 (squash `22feabff`, 2026-07-03, "Stage 3"); status verified retroactively by PR #1659 (`9b22a339`). Tasks: 13/13 complete.
**Full docs:** [specs/_archive/026-qu-survey-session-store/](../_archive/026-qu-survey-session-store/) (spec, plan, tasks, research, data-model, contracts/surveySessionStore.api.md, quickstart, checklists). Not read by default.
**Pinned here:** none (no code or living doc reads a file in the folder; the store's own header comments are the live reference).

## What shipped
- Stage 3 of the Unified Survey Architecture refactor: wizard-traversal state moved out of `StudioShell` `useState`/refs into a zustand store, `surveySessionStore`. It is additive next to `workingCopyStore`.
- Back navigation is walked history (`popHistory`), reproducing the old per-step back destinations. The three traversal oracle tests pass unmodified.
- The deleted `selectedTrackRef` is replaced by `useSurveySessionStore.getState().selectedTrack` inside `onInstantiate`.

## Public contracts
Source: `packages/studio/src/stores/surveySessionStore.ts`.
- `useSurveySessionStore` (`create<SurveySessionState>`), plus exported `ActiveStepId`, `CharactersSubStage`, `TouchSeedSource`, `DiscoveryMethod`, `SurveySessionSnapshot`.
- `advance(stepId)` pushes the current `activeStepId` onto `history` then sets the new one. `popHistory()` pops (no-op when empty). `reset()` clears every slot (start-over). `hydrate(snapshot)` bulk-sets from a persisted draft.
- Core slots: `activeStepId`, `history`, `identityResult`, `surveyContext`, `selectedTrack`, `scaffoldSpec`, `localBase`.
- The store owns the `ActiveStepId` union (not `steps/types.ts`), so terminals `"done"`/`"unsupported"` stay out of the step-contract module.

## Key decisions
- Type lives in the store; `StudioShell` imports it back (D-R1). `stores/` importing `steps/` is legal, the reverse is forbidden by depcruise (D-R2).
- `advance(x)` when already on `x` still pushes; no silent de-dup, so a real double-fire bug is not masked (D-R4).
- `instantiatedRef` stays a component `useRef`; `handleStartOver` calls `reset()` first, then clears the ref (D-R5).
- The intra-step characters sub-stage was component-local in this spec; spec 027 moved it into the store.

## Gotchas and limits
- The store has grown well past the spec's slot list: `visited`, `lastNavigation`, `marksMigrationNeeded`, `identityPhaseResult`, `baseConfirmed`, `charactersSubStage`, `touchSeedSource`, `discoveryMethod`, `markedForLaterDesktop/Touch`, and jump/back helpers (`jumpToStep`, `backToChooseBase`, `backToUnfinishedGallery`, `backToTouchSeedSource`).
- `sanitizeHistory` repairs persisted history holding entries at or after the current step (a stale persisted "help" bug); it uses a known-successor map.
- The store never calls `localStorage` itself; persistence is serialize/hydrate driven from outside.

## Divergences from the spec
- `ActiveStepId` is wider than the spec's 11 members (adds `deadkeys`, `marks`, `punctuation`, `invisibles`, `convenience`, `touch_seed_source`, and others).
- The slot list in `contracts/surveySessionStore.api.md` is the Stage-3 subset only; treat the code as authoritative.

## Follow-ups and open issues
- None recorded in tasks.md.
