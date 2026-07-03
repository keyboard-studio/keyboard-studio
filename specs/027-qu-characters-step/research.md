# Phase 0 — Research: CharactersStep

All unknowns resolved; no `NEEDS CLARIFICATION` remain. The two decisions the master plan
deferred "to the spec" are settled here.

## D-R1 — Substage persistence: dedicated typed slot vs generic scratch map

- **Decision**: Add a **dedicated typed slot** `charactersSubStage: "prefill" | "B"` (plus
  `setCharactersSubStage`) to `surveySessionStore`. Initial `"prefill"`; `reset()` clears it
  to `"prefill"`.
- **Rationale**: A history pop remounts `CharactersStep`, so component-local substage state
  would reset to `"prefill"` and regress back-from-carve (which must re-enter at PhaseB). The
  substage must live in state that outlives the remount — the session store. A dedicated
  typed slot matches the existing typed-slot idiom of `surveySessionStore` (spec 026 §3),
  keeps the union exhaustively type-checkable, and is the only cross-remount substage the
  wizard has.
- **Alternatives considered**: (a) generic `scratch: Record<string, unknown>` — rejected:
  loses type safety, invites unrelated ad-hoc state, over-general for one union. (b) keep it
  component-local and *lift the re-entry decision into the host* (host passes an initial
  substage prop) — rejected: re-introduces the survey-component substage knowledge this stage
  is deleting, and `EditorStepProps` has no such prop. (c) URL/query param — rejected: not how
  any other wizard state is persisted here.

## D-R2 — `findingsByQuestionId`: derive in component vs keep threading

- **Decision**: **Derive inside `CharactersStep`** — read `validatorFindings` from
  `workingCopyStore` and memoise `buildFindingsByQuestionId(validatorFindings)` (the same
  helper the survey component uses today at `StudioShell.tsx`). Drop the characters-step
  thread from the survey component. **`PhaseF` (help) keeps its threaded value unchanged.**
- **Rationale**: ADR-0001 — read the one source (the `validatorFindings` store bridge)
  directly instead of hand-threading a copy. The bridge already exists: an effect mirrors the
  live `useValidator` `findings` into `workingCopyStore.validatorFindings`
  (`setValidatorFindings`), reference-equality-guarded so it never loops. Reading it back and
  applying the same pure `buildFindingsByQuestionId` yields an identical map for identical
  state. Removes one more prop the survey component carries on a step's behalf, advancing the
  Stage-5 "steps read their own dependencies" goal.
- **Alternatives considered**: keep threading `findingsByQuestionId` as a prop — rejected:
  perpetuates the hand-thread ADR-0001 wants gone, and the value is already in a store the
  component can read. (Parity is preserved either way; the mirrored `pb_*` tests are the
  guard.)
- **Timing note**: the store bridge lags the live `findings` by at most the same render the
  effect runs in; `PhaseB` already consumed the memoised value, and the debounce cycle
  (D3) is unchanged. No new debounce or validation path is introduced (Article IV).

## D-R3 — Re-entry semantics (the fiddly bit)

- **Decision**: Reproduce today's six transitions exactly (spec §4 table). The store slot —
  not component state — is what survives the remount. `handleCarveBack` keeps `popHistory()`
  and **drops** its `setCharactersSub("B")` line: the slot is already `"B"` from when PhaseB
  was entered, so the remounted `CharactersStep` reads `"B"` and renders PhaseB.
- **Rationale**: The only behaviour that depends on cross-step persistence is carve-back →
  PhaseB. Everything else (confirm→B, B-back→prefill, prefill-back→host) is intra-mount or a
  host `onBack`. Moving the slot to the store makes carve-back fall out for free.
- **Fresh-entry guard**: a brand-new characters entry must start at prefill. `reset()` clears
  the slot to `"prefill"`; the advance-to-characters sites (adapt branch of
  `handleTrackSelected`, `handleProjectNameNext`) set it to `"prefill"` so no stale `"B"` from
  a prior in-session visit leaks. Verified by the start-over + fresh-walk tests.

## D-R4 — depcruise boundaries

- **Decision**: `CharactersStep` (in `survey/`) imports `survey/` (Prefill, PhaseB,
  SurveyRunner, loadModularFlow), `stores/` (surveySessionStore, workingCopyStore),
  `contracts`, and `steps/types` (EditorStepProps type-only). `steps/manifest.ts` imports
  `survey/CharactersStep`.
- **Rationale**: The survey component already reads both stores and mounts Prefill/PhaseB, so
  `survey/ → stores/` and the intra-`survey/` imports are established-legal. `steps/ →
  survey/` is explicitly allowed (handoff §4 depcruise note; the manifest already references
  survey adapters). A type-only import of `EditorStepProps` from `steps/types` is a leaf-type
  dependency, not a layering inversion.
- **Verification**: `pnpm depcruise` must be green; if `steps/manifest.ts → survey/…` trips a
  rule, the fallback is to keep the `CharactersStep` import in the survey component and expose
  the component through the manifest by reference set at the survey layer — but the expected
  outcome is that the existing `steps/ → survey/` allowance covers it.

## D-R5 — reuse inventory (nothing new invented)

Reused unchanged: `Prefill`, the PhaseB question battery + `SurveyRunner`, `loadModularFlow`,
`buildFindingsByQuestionId` (`lint/lintToQuestion`), `applyStepCompletion` + `reducerDeps`,
`routeAnswersThroughMutate`, `recordPhase`, `nextSpineStepAfter`, the `validatorFindings`
store bridge, `EditorStepProps`. Genuinely new: `survey/CharactersStep.tsx`, the
`charactersSubStage` store slot + setter, and the component test + RTL walk.
