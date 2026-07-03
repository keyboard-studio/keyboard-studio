# Feature Specification: CharactersStep — self-contained characters step; `charactersSub` dies

**Feature branch:** `km/qu-027-characters-step`
**Stage:** 4 of the Unified Survey Architecture refactor (master plan, decision D3).
**Governing decision:** [docs/adr/0001-flow-map-derived-from-one-source.md](../../docs/adr/0001-flow-map-derived-from-one-source.md)
— one source of truth per concern; no parallel hand-threaded copies to drift.
**Prerequisite:** [specs/026-qu-survey-session-store/spec.md](../026-qu-survey-session-store/spec.md)
(Stage 3) — this spec consumes and extends the `surveySessionStore` that stage created.
**Status:** Draft
**Created:** 2026-07-03

> ## Relationship to the surrounding stages
>
> Stage 1 (spec 024) retired `FLOW_SOURCES`; Stage 2 (spec 025) added the proposed-flow
> Library section; Stage 3 (spec 026) moved wizard **traversal** state into
> `surveySessionStore` while leaving the component tree and per-step props unchanged.
>
> **Stage 4 (this spec) makes the characters step self-contained.** It introduces a real
> `survey/CharactersStep.tsx` component that owns its internal `prefill → PhaseB` substage,
> replaces the `component: () => null` stub in the manifest with that component, and deletes
> the survey component's `charactersSub` `useState` plus the prefill/B completion and back
> handlers. This is the **first runtime use of a manifest `step.component`** — the seam the
> generic `StepHost` (Stage 5 / spec 028) will later drive for every step.
>
> This stage deliberately does **not** build the generic `StepHost`, `steps/advance.ts`, or
> the `FlowStepHost` factory (Stages 5–6). It changes exactly one step from hand-placed to
> component-driven; the other steps stay hand-rendered by the survey component until Stage 5.

---

## 1. Problem

The characters step is the one spine step whose internal flow is a **two-screen substage** —
`Prefill` (custom React: identity-derived character prefill) followed by `PhaseB` (the
`pb_*` question battery). Today that substage is not owned by a component. It leaks into the
survey component (currently embedded in
[packages/studio/src/StudioShell.tsx](../../packages/studio/src/StudioShell.tsx)) as:

1. **A component-local `charactersSub` `useState`** (`"prefill" | "B"`) plus five handlers —
   `handlePrefillConfirm`, `handlePrefillBack`, `handlePhaseBComplete`, `handlePhaseBBack`,
   and the `setCharactersSub("B")` line inside `handleCarveBack` — that together hand-wire
   the substage machine.
2. **A manifest `charactersStep.component: () => null` stub** with a comment promising the
   real component "in T028 via SurveyView's internal runner". The manifest declares the step
   but cannot render it; the survey component special-cases `stepId === "characters"` to
   render `Prefill`/`PhaseB` inline instead.
3. **A hand-threaded `findingsByQuestionId` prop** passed from the survey component down into
   `PhaseB`, derived there from the `validatorFindings` store bridge — one more prop the
   survey component threads on the step's behalf.

While the substage machine lives in the survey component, the characters step cannot be
driven by its manifest `component`, so the generic `StepHost` (Stage 5) has nothing uniform
to mount. Making the step self-contained is the prerequisite.

## 2. Goal

Introduce **`packages/studio/src/survey/CharactersStep.tsx`** — an `EditorStepProps`
component that hosts the `prefill → PhaseB` substage internally, mounting the **same**
`Prefill` and `PhaseB` components in the **same order** as today. Point the manifest
`charactersStep.component` at it, and delete the survey component's `charactersSub` state and
its five substage handlers. The component:

- reads `identityResult`, `localBase`, and `surveyContext` from `surveySessionStore`;
- emits the Phase B `SurveyPhaseResult` via `props.onComplete`;
- calls `props.onBack` when the user backs out of the **prefill** substage (the substage
  bottom — the host then pops walked history exactly as `handlePrefillBack` does today);
- derives `findingsByQuestionId` internally from the `validatorFindings` store bridge;
- persists its substage in a `surveySessionStore` scratch slot so **back-from-carve
  re-enters at PhaseB** (the current UX), surviving the component remount that a history pop
  causes.

**Parity contract:** same `Prefill`/`PhaseB` components, same order, same copy-track and
adapt-track screen sequences — **user-visible screens are identical.** The characters step
stays exactly as opaque and self-contained on the Flow Map as `CarveGallery`: one node with
drill-downs, unchanged render, bijection node set unchanged.

## 3. Why option (2): a self-contained component, not two manifest steps (D3)

The master plan considered promoting prefill and PhaseB to **two** manifest steps (option 1)
versus one self-contained component (option 2) and chose (2):

- **Synthesis already ruled prefill/B intra-phase** (the `manifest.ts` DEC-D1 comment; the
  T028 decision). Option (1) reverses a recorded decision with no new evidence.
- **Option (1) forces DEC-D1 re-anchoring.** The declared `writes:[irPath("header","bcp47")]`
  subsumption would have to split across two steps, re-proving manifest-level C5
  (`checkInputsSatisfiable`) satisfiability and changing the manifest spine — touching the
  M2 validator, the drift bijection node set, and the migration-plan invariant. Large blast
  radius, zero user value.
- **Option (2) matches "galleries stay opaque."** `characters` becomes exactly as opaque and
  self-contained as `CarveGallery`. The map keeps one node with drill-downs (render
  unchanged); the bijection node set is unchanged.

`Prefill` remains custom React inside `CharactersStep`; `PhaseB` mounts via the same
`loadModularFlow`/`SurveyRunner` path it uses today. **The manifest `charactersStep` declared
`writes` and the DEC-D1 subsumption are unchanged.**

## 4. Substage ownership & re-entry (the fiddly bit — D3)

Today the substage lives in the survey component, so `handleCarveBack` can pop history back
to `characters` **and** call `setCharactersSub("B")` in the same handler, re-entering the
characters step at PhaseB rather than replaying prefill. Once the substage moves inside
`CharactersStep`, a history pop **remounts** the component, and component-local substage
state would reset to `"prefill"` — silently regressing the back-from-carve UX.

**Resolution (D3): persist the substage in `surveySessionStore`.** Add a single dedicated,
typed slot to the store (created in spec 026):

| Slot | Type | Meaning |
|------|------|---------|
| `charactersSubStage` | `"prefill" \| "B"` | The characters step's internal substage; survives remount so back-from-carve re-enters at PhaseB. |

with a setter `setCharactersSubStage(s)`, initial value `"prefill"`, and cleared to
`"prefill"` by `reset()` (start-over). A **dedicated typed slot** is chosen over a generic
`scratch: Record<string, unknown>` map because it matches the existing typed-slot idiom of
`surveySessionStore` (§3 of spec 026), keeps the union exhaustively checkable, and is the
only cross-remount substage the wizard has.

Behavioural mapping (must reproduce today exactly):

| Event | Today (survey component) | After (CharactersStep + store) |
|-------|--------------------------|-------------------------------|
| Enter characters (prefill) | `setCharactersSub("prefill")` at track/project_name advance | store slot already `"prefill"` (initial / set on advance to characters) |
| Prefill confirmed → PhaseB | `handlePrefillConfirm` → `setCharactersSub("B")` | component calls `setCharactersSubStage("B")` |
| Back within PhaseB → prefill | `handlePhaseBBack` → `setCharactersSub("prefill")` | component sets `setCharactersSubStage("prefill")` (intra-step; no host `onBack`) |
| Back out of prefill (substage bottom) | `handlePrefillBack` → `popHistory()` | component calls `props.onBack` → host `popHistory()` |
| PhaseB complete → carve | `handlePhaseBComplete` (record + mutate + applyStepCompletion + advance) | component calls `props.onComplete(result)`; host runs the same completion path |
| Back-from-carve → characters/B | `handleCarveBack` → `popHistory()` + `setCharactersSub("B")` | `handleCarveBack` → `popHistory()` only; store slot is still `"B"`, so CharactersStep remounts at PhaseB |

## 5. Component contract (`CharactersStep.tsx`)

`CharactersStep` satisfies the shared `EditorStepProps` contract — the same prop shape every
future `StepHost`-driven step will receive. For this stage the survey component mounts it
directly (not yet via `StepHost`).

- **Props consumed:** `onComplete(result: SurveyPhaseResult)`, `onBack()`. (Any `ctx`/layout
  chrome in `EditorStepProps` is passed through unchanged; the step declares `layout:"pane"`
  by default — unchanged from today.)
- **Store reads (selectors):** `identityResult`, `localBase`, `surveyContext`,
  `charactersSubStage` from `surveySessionStore`; `findingsByQuestionId` derived from the
  `validatorFindings` store bridge (see §6).
- **Internal render:**
  - When `charactersSubStage === "prefill"` and `identityResult !== null && localBase !== null`:
    render `Prefill` with the **same** props as today (`identity`, `base`, `onConfirm`,
    `onBack`). `onConfirm` → `setCharactersSubStage("B")`; `onBack` → `props.onBack()`.
  - When `charactersSubStage === "B"`: render `PhaseB` with the **same** props as today
    (`context={surveyContext}`, `onComplete`, `onBack`, `findingsByQuestionId`).
    `onComplete` → `props.onComplete(result)`; `onBack` → `setCharactersSubStage("prefill")`
    (intra-step; `PhaseB`/`SurveyRunner`'s own answer stack owns navigation until it bottoms
    out to its `onBack`). **`placementMap` is intentionally not supplied to `PhaseB`** in v1,
    matching today (D-INT-2).
  - Guard: if `identityResult`/`localBase` are null (should not happen once the step is
    reached), render nothing (matches today's `null` fallbacks) rather than crashing.

## 6. `findingsByQuestionId` — derive inside the component (D3, decided)

Today the survey component builds `findingsByQuestionId` (a `useMemo` over the
`validatorFindings` store bridge) and threads it into `PhaseB` (and `PhaseF`). The master
plan left "derive inside the component vs keep threading" open "to decide finally in the
spec."

**Decision: derive it inside `CharactersStep`** from the same `validatorFindings` store
bridge, removing the characters-step thread from the survey component. Rationale: it is the
ADR-0001 move (read the one source directly rather than hand-thread a copy), and it removes
one more prop the survey component carries on a step's behalf — advancing the Stage-5 goal
where steps read their own dependencies. **`PhaseF` (the help step) keeps its threaded
`findingsByQuestionId` unchanged this stage** — it is out of scope until its own adapter
lands in Stage 5; the shared derivation helper (if extracted) must not change `PhaseF`'s
behaviour.

## 7. Survey-component changes (deletions)

In the survey component (today in `StudioShell.tsx`):

- **Delete** the `charactersSub` `useState` and the `CharactersSubStage` local usage.
- **Delete** `handlePrefillConfirm`, `handlePrefillBack`, `handlePhaseBComplete`,
  `handlePhaseBBack`, and the `setCharactersSub("prefill"/"B")` lines in
  `handleTrackSelected`, `handleProjectNameNext`, and `handleStartOver`.
  - The advance-to-characters sites (`handleTrackSelected` adapt branch,
    `handleProjectNameNext`) set the store substage to `"prefill"` via
    `setCharactersSubStage("prefill")` if any explicit reset is needed beyond the store
    initial/`reset()` — verify against the re-entry table (§4) so a fresh characters entry
    always starts at prefill while back-from-carve re-enters at B.
- **`handleCarveBack`** drops its `setCharactersSub("B")` line and keeps `popHistory()` only
  (the store slot already holds `"B"`).
- **Replace** the `stepId === "characters"` inline `Prefill`/`PhaseB` branch with a mount of
  the manifest `charactersStep.component` (`<CharactersStep onComplete={…} onBack={…} />`) —
  the **first runtime use of `step.component`**. The `onComplete` handler runs the same
  completion path `handlePhaseBComplete` runs today (`recordPhase` →
  `routeAnswersThroughMutate` → `applyStepCompletion("characters", result, reducerDeps)` →
  `advance(nextSpineStepAfter("characters"))`); `onBack` calls `popHistory()` (today's
  `handlePrefillBack`).
- **Stop threading `findingsByQuestionId` into the characters branch** (the component derives
  it); the `PhaseF`/help thread is unchanged.

## 8. Manifest change

`packages/studio/src/steps/manifest.ts`:

- `charactersStep.component` changes from `() => null` to the `CharactersStep` adapter
  (import from `survey/CharactersStep`).
- `charactersStep.writes` (`[irPath("header","bcp47")]`), the DEC-D1 subsumption comment,
  `spine: true`, `flowRefs: ["phase_b_characters"]`, `layout` (default `"pane"`), and the
  step's position in the ordered manifest are **unchanged**.
- Depcruise: `steps/manifest.ts` importing `survey/CharactersStep` must satisfy the
  boundary rules (`steps/` may import `survey/`; `CharactersStep` imports `survey/` +
  `stores/` + `contracts` + `ui/` — verify `survey/` → `stores/` is permitted, as the
  survey component already reads the store).

## 9. Risks (call out, mitigate)

- **Re-entry at PhaseB (the fiddly bit).** Getting back-from-carve to land on PhaseB rather
  than prefill is the load-bearing behaviour. Mitigation: the §4 mapping table is the spec;
  the store slot (not component state) is what survives the remount; a unit + RTL test asserts
  carve-back re-enters at PhaseB (§SC).
- **Fresh-entry starts at prefill.** A brand-new characters entry (copy or adapt) must start
  at prefill even though the slot survives remounts. Mitigation: `reset()` clears the slot to
  `"prefill"`; the advance-to-characters sites set it to `"prefill"`; verify no stale `"B"`
  leaks from a prior session (start-over test).
- **`findingsByQuestionId` parity.** The internally-derived map must equal today's threaded
  value for the same store state. Mitigation: derive from the identical `validatorFindings`
  bridge; the mirrored per-question tests run unmodified.
- **First `step.component` mount.** This is the first time a manifest `component` renders at
  runtime; a wrong prop contract would surface only here. Mitigation: `CharactersStep`
  conforms to `EditorStepProps`; a render-smoke test mounts it via the manifest entry.

## Functional requirements

- **FR-001** A new `survey/CharactersStep.tsx` component satisfies `EditorStepProps` and
  hosts the `prefill → PhaseB` substage internally, mounting the same `Prefill` and `PhaseB`
  components in the same order as today.
- **FR-002** `CharactersStep` reads `identityResult`, `localBase`, `surveyContext`, and
  `charactersSubStage` from `surveySessionStore`, and derives `findingsByQuestionId`
  internally from the `validatorFindings` store bridge.
- **FR-003** `surveySessionStore` gains a dedicated typed slot `charactersSubStage:
  "prefill" | "B"` (initial `"prefill"`), a `setCharactersSubStage` setter, and `reset()`
  clears it to `"prefill"`.
- **FR-004** Prefill-confirm sets the substage to `"B"`; PhaseB-back sets it to `"prefill"`
  (intra-step, no host `onBack`); backing out of prefill calls `props.onBack`; PhaseB-complete
  calls `props.onComplete(result)`.
- **FR-005** The manifest `charactersStep.component` is the `CharactersStep` adapter; its
  declared `writes`, DEC-D1 subsumption, `spine`, `flowRefs`, `layout`, and manifest position
  are unchanged.
- **FR-006** The survey component deletes the `charactersSub` `useState` and the five
  substage handlers, renders the characters step via its manifest `component` (first runtime
  use of `step.component`), and runs the unchanged completion path (`recordPhase` →
  `routeAnswersThroughMutate` → `applyStepCompletion` → `advance`) in the `onComplete` it
  passes to `CharactersStep`.
- **FR-007** `handleCarveBack` pops history only; the persisted `charactersSubStage` slot
  (still `"B"`) makes the remounted `CharactersStep` re-enter at PhaseB.
- **FR-008** A fresh characters entry (copy-track via project_name, adapt-track direct) starts
  at prefill; start-over clears the substage to `"prefill"`.
- **FR-009** The help step (`PhaseF`) `findingsByQuestionId` threading is unchanged; no other
  step's props change.
- **FR-010** Same `Prefill`/`PhaseB` components, same order, identical copy-track and
  adapt-track screen sequences — zero user-visible screen change.

## Success criteria

- **SC-001** `survey/CharactersStep.test.tsx` (new) covers: prefill → confirm → PhaseB →
  complete emits the Phase B `SurveyPhaseResult` via `onComplete`; PhaseB-back returns to
  prefill; prefill-back calls `props.onBack`; and — with the store substage slot pre-set to
  `"B"` — the component mounts directly at PhaseB (the carve-back re-entry proof).
- **SC-002** A new RTL walk asserts both tracks render identical screen sequences to today:
  copy-track (track → project_name → prefill → PhaseB → carve) and adapt-track (track →
  prefill → PhaseB → carve), including back-from-carve landing on PhaseB.
- **SC-003** The mirrored per-question `pb_*` tests and the `surveySessionStore` traversal
  oracle tests (`trackRouting`, `prefillRouting`) pass; `StudioShell` tests are updated only
  where they asserted `charactersSub` internals (the substage now lives in the store), and
  the update is limited to that plumbing.
- **SC-004** `pnpm --filter @keyboard-studio/studio typecheck`,
  `pnpm --filter @keyboard-studio/studio test` (baseline 4 pre-existing failures only —
  3× `projectWorkingCopyVfs.flagParity.test.ts` CRLF golden + 1× `articleIVProbe.test.ts`),
  and `pnpm depcruise` are green.
- **SC-005** The Flow Map is unchanged: `characters` remains one opaque node with its
  `phase_b_characters` drill-downs; the drift-guardrail bijection node set is unmodified
  (`dashboard/driftGuardrail.test.ts` green, unmodified).

## Assumptions

- The survey component remains embedded in `StudioShell.tsx` this stage (no file split);
  Stage 5 shrinks it and introduces `StepHost`. This spec changes one step from hand-placed
  to component-driven, not the file boundary.
- `surveySessionStore` (spec 026) exists on the base branch (`km/qu-026-survey-session-store`)
  and this branch stacks on it; extending it with `charactersSubStage` is additive and does
  not alter the spec-026 traversal-slot contract or its parity proof.
- `EditorStepProps` is the existing shared step-component prop contract; `CharactersStep` is
  the first step to be driven through a manifest `component`, but the prop shape is unchanged.
- `Prefill`, `PhaseB`, `SurveyRunner`, `loadModularFlow`, `applyStepCompletion`,
  `routeAnswersThroughMutate`, `recordPhase`, and the `validatorFindings` store bridge are
  reused unchanged.

## Out of scope

Generic `StepHost` and `steps/advance.ts` pure advance policy (Stage 5, spec 028);
`FlowStepHost` + `makeFlowStepComponent` (Stage 6); a `PhaseF`/help adapter or any change to
`PhaseF`'s `findingsByQuestionId` threading; `placementMap` supply to `PhaseB` (stays absent
per D-INT-2); any change to the manifest spine, declared `writes`, the Flow Map bijection
node set, the live survey render order, or the `pb_*` / `phase_b_characters` question
membership.
