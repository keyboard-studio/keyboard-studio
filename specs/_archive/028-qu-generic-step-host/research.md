# Research: Generic StepHost — Stage 5

All decisions below resolve the (few) unknowns in the plan's Technical Context. There are no
open `NEEDS CLARIFICATION` items — the master plan (D5/D7) and the existing code fix most
choices; the rest are recorded here.

## R1 — Where does `nextSpineStepAfter` / the fork logic live after Stage 5?

**Decision**: Move the manifest-traversal helpers (`manifestIndexOf`, `nextSpineStepAfter`) and
the copy/adapt fork out of `StudioShell.tsx` into the new pure `steps/advance.ts`, exported as a
single `advance(step, result, session) -> ActiveStepId` policy (plus the small helpers it needs).

**Rationale**: Today these are *private* functions in `StudioShell.tsx` (lines 316–354) and the
fork is inlined in `handleTrackSelected`/`handleProjectNameNext`. The plan (D7) wants one pure
policy so the host has no per-step branching. `steps/advance.ts` is the natural home — colocated
with `manifest.ts`, same layer.

**Alternatives considered**:
- *Keep `nextSpineStepAfter` in the shell and call it from the host* — rejected: leaves fork
  logic split between shell and policy; host would still need a `track`-specific branch.
- *Read the store inside `advance.ts`* — rejected: violates the `steps/` depcruise rule (no
  `stores/` import). Instead the policy takes the needed session values (`selectedTrack`) as
  arguments; the host reads the store and passes them in.

## R2 — Advance-policy signature (boundary-clean, pure)

**Decision**: `advance(completedStepId: ActiveStepId, result: unknown, ctx: AdvanceContext): AdvanceOutcome`
where `AdvanceContext` is a plain snapshot `{ selectedTrack: Track | null; identitySupported: boolean }`
and `AdvanceOutcome` is `{ next: ActiveStepId; navigate?: "output" }`. Pure, synchronous, no
imports beyond `manifest`/`types`.

**Rationale**: The only branch inputs today are (a) the completed step id, (b) `selectedTrack`
(copy vs adapt at `track`), and (c) `identity.supported` (supported vs `unsupported` at
`identity`). The result payload is otherwise inspected only for side effects, which stay in the
host. Returning an optional `navigate` lets the host reproduce `navigateTo("output")` on `done`
without the policy importing the router.

**Alternatives considered**: passing the whole `SurveySessionState` — rejected: couples the
pure policy to the store shape and tempts it to read slots it should not.

## R3 — Fork + terminal mapping (must reproduce today exactly)

**Decision**: The policy encodes precisely today's behaviour:
- `identity` → `nextSpineStepAfter("identity")` (= `choose_base`) when supported, else `unsupported`.
- `choose_base` → `nextSpineStepAfter("choose_base")` (= `track`).
- `track` → `project_name` when `selectedTrack === "copy"`; else `nextSpineStepAfter("track")`
  (skips `project_name` → `characters`).
- `project_name` → `characters` (its `joinTarget`).
- `characters` → `nextSpineStepAfter("characters")` (= `carve`).
- `carve` → `mechanisms`; `mechanisms` → `touch` (spine skips `touch_seed_source`);
  `touch` → `help`; `help` → `done` (+ `navigate: "output"`).

**Rationale**: One-to-one with the current handlers (SurveyView lines 596–683). `touch_seed_source`
is `spine:false` and is skipped by `nextSpineStepAfter` exactly as today (it is not currently a
reachable active step in the walk — the touch step seeds itself; this stage does not change that).

## R4 — Chrome selection by `layout`

**Decision**: `StepHost` renders `layout: "full"` steps (carve, mechanisms, touch) inside the
full-screen container (`<div style={{height:"100%",overflow:"hidden"}}>`) and all other steps in
the left survey pane. The survey component keeps owning the two-pane flex shell + OSK right pane;
`StepHost` returns either the full-screen node or the left-pane node, and the shell composes it.

**Rationale**: `layout` was added declaration-only in Stage 0 and asserted by
`validateManifestShape` (only carve/mechanisms/touch may be `"full"`). Stage 5 makes it
load-bearing, which is the explicitly-planned "temporary guard until Stage 5" graduation.

**Alternatives considered**: host owns the whole two-pane shell — rejected by FR-009 (pane
scaffolding, OSK, validator, `instantiatedRef` stay in the survey component; interleaving the OSK
pipeline with full-screen steps is the largest risk and is mitigated by keeping panes in the shell).

## R5 — Terminals (`done`, `unsupported`) are not manifest steps

**Decision**: `StepHost` special-cases the two terminal ids: `done` → the "Survey complete" panel
(+ Start over); `unsupported` → `UnsupportedScriptStub` (+ Start over). Everything else resolves
`manifest.find(s => s.id === activeStepId).component`. An unknown id renders the existing visible
error panel (exhaustiveness guard preserved).

**Rationale**: `ActiveStepId` already includes `done`/`unsupported` as non-manifest terminals
(surveySessionStore comment). The host cannot resolve a component for them, so they are handled
before the manifest lookup. This keeps FR-001 ("no per-step branch") honest — terminals are a
*terminal* branch, not a per-*step* branch, and there are exactly two, fixed by the type.

## R6 — Real adapters for `identity` and `help`; adapters self-source context

**Decision**: Add `IdentityLiteAdapter` and `PhaseFAdapter` to `editors/adapters/panelAdapters.tsx`.
Each satisfies `EditorStepProps` and internally reads what it needs from stores/hooks:
- `IdentityLiteAdapter`: reads `surveyContext` + derives `findingsByQuestionId` from the
  `validatorFindings` store bridge; calls `onComplete(result, identity)`-shaped completion by
  emitting the `SurveyPhaseResult` **and** stashing the `IdentityLiteResult` into the session
  store (the host's centralized completion path then does record/route/advance). Because the
  host's `onComplete` is `(result: unknown) => void`, the identity-specific `setIdentityResult`
  + `setSurveyContext` move into the adapter (or into a host completion hook keyed by id) — see R7.
- `PhaseFAdapter`: reads `surveyContext` + `findingsByQuestionId` from the store bridge; emits the
  Phase F `SurveyPhaseResult` via `onComplete`.
- Mechanisms adapter: `usePlacementPriors()` moves inside it (was hand-threaded as
  `placementMap` prop from the shell).

**Rationale**: FR-006/FR-007. The placeholders (`TrackOneIdentityPanelAdapter` on both
`identityStep` and `helpStep`) currently disagree with what the shell mounts; making the declared
component real removes the disagreement and is a prerequisite for the host driving `step.component`.

**Alternatives considered**: keep threading props through the host — rejected: the host would need
per-step prop maps, re-introducing per-step knowledge the stage is removing.

## R7 — Centralized completion: how identity's extra side effects are handled

**Decision**: The host completion path is keyed by a tiny per-step *effect* table colocated with
the advance policy (or folded into `applyStepCompletion` where already handled). Concretely:
today `handleIdentityComplete` does `recordPhase` + `routeAnswersThroughMutate` +
`setIdentityResult` + `setSurveyContext` + advance. The identity-specific store writes
(`setIdentityResult`/`setSurveyContext`) are the only step-specific completion effect not already
inside `applyStepCompletion`. Move them into `IdentityLiteAdapter` (the adapter has the
`IdentityLiteResult` in hand and may write the session store), so the host's generic completion
path is uniformly: `recordPhase(result?)` + `routeAnswersThroughMutate(result?)` +
`applyStepCompletion(id, result, deps)` + `advance(...)` + optional `navigate`.

**Rationale**: Keeps the host generic. `recordPhase`/`routeAnswersThroughMutate` are safe no-ops
for non-`SurveyPhaseResult` results (guard on shape), matching today where only some handlers call
them. The identity result → session-store write is genuinely identity-specific data, so it belongs
with the identity adapter, not the host.

**Alternatives considered**: a `switch(id)` completion table in the host — rejected as reintroducing
per-step branching; the effect table (if needed) lives next to the manifest/advance policy, not in
the host, and is data not control-flow.

## R8 — Parity oracle: golden-walk fixtures, committed first

**Decision**: Author a golden-walk RTL harness that drives a scripted copy-track and adapt-track
survey run and records the ordered sequence of `(stepId, applyStepCompletion calls, store
mutations, navigateTo calls)` to JSON fixtures. Commit the fixtures + a passing test against the
**pre-refactor** tree in a commit that precedes the StepHost refactor commit. After the refactor,
the same test asserts an identical sequence.

**Rationale**: This is the SC-001 gate and the whole risk mitigation for the render-change stage.
It mirrors the `wireGalleries` byte-oracle pattern named in the master plan. Committing first makes
the "recorded on main" provenance auditable in git history.

**Alternatives considered**: snapshot the rendered DOM — rejected: brittle to incidental markup;
the behavioural sequence (effects + navigation + step order) is the actual parity contract.

## R9 — Boundary & dependency-cruiser

**Decision**: `steps/advance.ts` imports only `./manifest.ts` + `./types.ts` (+ the
`ActiveStepId`/`Track` *types*). `components/StepHost.tsx` imports stores, hooks, adapters, and
`steps/advance.ts`. `steps/` → `stores/`/`lib/`/`components/` remains forbidden; the host is a
component so it is unrestricted. Run `pnpm depcruise` as a gate.

**Rationale**: Matches the existing `steps/` layer rule (manifest.ts comment). `Track` is a type,
so importing it into `advance.ts` is a type-only edge (allowed).
