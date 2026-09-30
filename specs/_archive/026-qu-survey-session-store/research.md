# Research — surveySessionStore (Stage 3)

Phase 0 decisions. No open `NEEDS CLARIFICATION` remain.

## D-R1 — Where does the `ActiveStepId` type live?

**Problem.** `ActiveStepId` (the step-id union incl. terminals `"done"`/`"unsupported"`) is
currently declared locally at `StudioShell.tsx:237` and not exported. The store needs it.

**Decision.** **Define and export `ActiveStepId` from `surveySessionStore.ts`** (the store
owns the traversal vocabulary). `StudioShell.tsx` deletes its local declaration and imports
the type back from the store.

**Rationale.**
- depcruise: `StudioShell.tsx` (repo-src root) → `stores/` is already done today
  (`workingCopyStore` import), so importing the type from the store is legal.
- Co-locates the traversal-state vocabulary with the state that uses it (the store *is* the
  traversal owner now).
- Avoids widening `steps/types.ts`, whose vocabulary is manifest *step contracts* — the
  terminal pseudo-states `"done"`/`"unsupported"` are not manifest steps and don't belong
  there.

**Alternatives rejected.**
- *Relocate to `steps/types.ts`.* Legal (`stores/ → steps/` is not forbidden; only
  `steps/ → stores/` is, per `.dependency-cruiser.cjs:72-80`), but pollutes the step-contract
  module with non-step terminals. Rejected for cohesion.
- *Type `activeStepId` as bare `string`.* Loses the compile-time exhaustiveness the survey
  switch relies on. Rejected.

## D-R2 — depcruise legality of the store's imports

**Decision.** The store imports only: `zustand` (`create`), `BaseKeyboard` from
`@keyboard-studio/contracts`, and type-only imports of `Track` (`survey/PhaseTrack.tsx`),
`ScaffoldSpec` (`hooks/useKeyboardArtifact.ts`), `IdentityLiteResult` (`survey/index.ts`),
`SurveyContext` (`survey/types.ts`). `ActiveStepId` is defined in-file (D-R1).

**Rationale.** The only store-related depcruise prohibitions are on *consumers* of stores
(`ui/`, `steps/`, `dashboard/`, `survey/questions/` may not import `stores/`). There is **no
rule constraining what `stores/` may import**, and `workingCopyStore.ts` already imports from
`survey/` and `hooks/`. So these type imports are within bounds. **Verify empirically** with
`pnpm depcruise` after implementation (fast, authoritative).

**Watch-out.** Keep the `survey`/`hooks` imports **type-only** (`import type { … }`) so no
runtime component code is pulled into the store bundle graph. `ScaffoldSpec` sits in
`useKeyboardArtifact.ts` alongside hook runtime — a `import type` keeps it clean.

## D-R3 — Walked-history back must reproduce the routing oracles exactly

**Decision.** `advance(stepId)` pushes the current `activeStepId` onto `history` before
switching; `popHistory()` pops the last entry and makes it active (no-op on empty history).
Back handlers that today re-derive a destination from `selectedTrack` become `popHistory()`.

**Rationale (why it reproduces today, per D5).**
- Copy path walks `identity → … → track → project_name → characters`; each hop went through
  `advance`, so `history` top when at `characters` is `project_name` → back = `project_name`.
- Adapt path walks `identity → … → track → characters` (project_name skipped); `history` top
  at `characters` is `track` → back = `track`.
- These are exactly the `handlePrefillBack` destinations today. `handleProjectNameBack`
  (→`track`) and `handleBaseBack` (→`identity`) likewise fall out of the walked history.

**Intra-step exception.** `charactersSub` (prefill/B) is intra-step and NOT a history entry.
`handlePhaseBBack` (B→prefill) stays a pure `setCharactersSub("prefill")` with no pop.
`handleCarveBack` pops to `characters` **and** sets `charactersSub("B")` to restore the
sub-stage — the pop restores the step, the local setter restores the sub-stage. This
faithful pairing is what keeps `prefillRouting.test.ts` green unmodified.

**Verification.** The three oracle tests (`StudioShell.test.tsx`, `trackRouting.test.ts`,
`prefillRouting.test.ts`) run unmodified as the acceptance gate.

## D-R4 — double-advance idempotence

**Decision.** `advance(x)` while `activeStepId === x` still pushes `x` onto history (honest
record of the walked path) — but the survey never calls `advance` to the step it is already
on; forward transitions always target a *different* step. The store test asserts that even
if it happened, the stack stays coherent (no corruption, back still returns to the prior
distinct step). We do **not** silently de-dup, because de-duping would diverge from a literal
walked-path record and could mask a real double-fire bug.

**Rationale.** Matches D5's "walked history, not manifest order." Idempotence here means
"does not corrupt the stack," not "collapses repeats."

## D-R5 — localBase & instantiatedRef timing (risk mitigations)

- **localBase.** Moves into the store as a value slot, but the existing effect that feeds the
  compile pipeline stays in the component wired to the store selector — only the storage
  location changes, not *when* the pipeline observes it. Verified by the compile still firing
  on base selection in `StudioShell.test.tsx`.
- **instantiatedRef.** Stays a `useRef` in the component (a pipeline concern per D4). Reset
  order in `handleStartOver`: call `session.reset()` first, then `instantiatedRef.current =
  false`, so the guard is clear before any re-instantiation can fire.
