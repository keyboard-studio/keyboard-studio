# Proposal — assignment-map contract (breaking redesign)

**For:** the #5b joint engine+content session (spec §17).
**Status:** proposal. The *additive* step has landed (issue #368); this document is the **breaking** step it defers.
**Spec basis:** [spec.md](../spec.md) §7.7 "Gallery output and assignment-map precedence" (v1.2.0).
**Epic:** #367. **Session issue:** #372.

## Why

The gallery's output is a **scoped, multi-valued mechanism assignment map** (§7.7):
default → character-class → individual precedence, 1..N mechanisms per character,
computed once per modality. The locked Day-1 contract represents gallery output as a
**flat `string[]`** — `SurveyPhaseResult.selectedPatternIds` ([surveyPhaseResult.ts](../packages/contracts/src/surveyPhaseResult.ts))
— which cannot express scope, multiplicity, slot values, or modality. The two
representations now coexist, which is the smell this session must resolve.

## What already landed (additive, non-breaking — issue #368)

A minor contracts bump (0.4.0 → 0.5.0), no joint session required (additive optional
per §17):

- `packages/contracts/src/assignmentMap.ts`: `AssignmentScope`, `Modality`,
  `MechanismRef`, `MechanismAssignment`, plus pure helpers `mergeAssignments`
  (last-wins per `modality+scope+target`), `effectiveMechanisms` (precedence resolver),
  and `uncoveredTargets` (the criterion 18.6 coverage dead-end check).
- `SurveyPhaseResult.assignments?: MechanismAssignment[]` — **alongside**
  `selectedPatternIds`, not replacing it.
- `SurveySession.assignments: MechanismAssignment[]` — merged across phases by
  `mergePhaseResults`.

This unblocks the gallery UI (Phase 3 of #367) on a real shape without pre-empting the
irreversible decision below.

## The decision for this session

**Collapse `selectedPatternIds` into the assignment map, or keep both?**

`selectedPatternIds` is a lossy projection of `assignments` (it is the set of
`MechanismRef.patternId` across all assignments). Options:

- **(A) Collapse — recommended.** Remove `selectedPatternIds`; derive the flat set on
  demand from `assignments` for any consumer that still wants it (a one-line helper
  `patternIdsOf(assignments)`). Single source of truth; no drift. **Breaking** — major
  contracts bump; every consumer updated.
- **(B) Keep both, define `selectedPatternIds` as derived.** Non-breaking, but two
  fields that must be kept consistent — the drift risk §7.7 flags. Only sensible as a
  deprecation bridge.
- **(C) Keep both independent.** Rejected — guarantees drift.

## Pattern-schema touchpoints (the reason this is a joint session)

`MechanismRef` references a `Pattern` by `id` and carries `slotValues`. Assess whether
the breaking step needs any change to the **locked `Pattern` schema** (§5, the Day-1
contract):

1. **No Pattern change (preferred).** `MechanismRef.slotValues: Record<string,string>`
   stands alone; `Pattern.questions` remains the slot *schema* and `MechanismRef`
   carries the *filled* values. If true, the break is confined to `SurveyPhaseResult` /
   `SurveySession` and is a smaller blast radius.
2. **Pattern change needed?** Only if a mechanism must record state the pattern doesn't
   already model (e.g. per-assignment modality overrides, or a class-membership
   back-reference). Decide explicitly; a `Pattern` field change is a major bump + this
   session per §17.

## Consumer blast radius (option A)

From the additive-step survey, consumers of `selectedPatternIds` / `SurveyPhaseResult`:

- `packages/contracts/src/surveySession.ts` (`mergePhaseResults`, `updateIrAxes`)
- `packages/contracts/src/fixtures/surveySessions.ts`, `surveySession.test.ts`
- studio survey phases (`SurveyRunner.tsx`, `PhaseA/B/F.tsx`) — construct results
- gallery selection / ranking (`PatternLibraryService.filterFor`, `CarveGallery.tsx`)
- engine recognizer (`interpreter.ts`) if recognized patterns carry assignments

Each must move from "push a pattern id" to "push a `MechanismAssignment`". Provide
`patternIdsOf()` so read-only consumers migrate trivially.

## Class membership — orthogonal, decide ownership

`effectiveMechanisms` / `uncoveredTargets` take class membership as a caller-supplied
input (a char → class-ids function) because it lives in the inventory layer, not the
assignment map. Confirm that ownership, and whether class definitions need their own
typed home (e.g. on `LinguistInventory` or a new `CharacterClass` type) — currently
informal.

## Open questions for the session

1. Option A vs B (collapse vs derived-bridge)? Recommended: A, with `patternIdsOf()`.
2. Any `Pattern`-schema change required, or is the break confined to survey types?
3. Multi-class precedence tie-break — the additive helper uses "first matching class";
   ratify or replace with an explicit class-priority field.
4. Where do `CharacterClass` definitions live (membership ownership)?
5. Major version target for `@keyboard-studio/contracts` (1.0.0, or 0.x major-equivalent
   per the pre-1.0 convention in the package README).

## Acceptance (issue #372)

- This proposal reviewed by engine + content.
- Decisions 1–5 recorded.
- Contract updated; consumers migrated; tests green (`pnpm -r typecheck && pnpm -r test`).
- spec §7.7 "Contract status — additive now, breaking redesign deferred" rewritten to
  describe the ratified shape; spec-signoff amendment record added.
