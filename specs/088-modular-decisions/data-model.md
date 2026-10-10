# Data Model: Decision store (spec 088)

**Phase 1 output of `/speckit-plan`.** All types live in `packages/studio`; nothing in
`packages/contracts` changes (FR-010). Existing type locations are verified on
`km/modular-decisions` @ 07356c2f.

## 1. Decision record (extended, in place)

Location: `packages/studio/src/decisions/decisionTypes.ts` — the existing `Decision`
interface (`:165-170`) is extended; `DecisionSet` (`:177`) is unchanged in shape.

| Field | Type | Change | Meaning |
|---|---|---|---|
| `id` | `DecisionId` | existing | The decision's stable id (e.g. `copyright-holder`, `authoring-track`). The store key. |
| `value` | `T` (unknown at the set level) | existing | The resolved value. |
| `provenance` | `DecisionProvenance` | **extended** | See §2. |
| `source?` | `string` | existing | Origin name for extracted values (e.g. the starting-point keyboard id). Set only when present (`exactOptionalPropertyTypes`). |
| `inputs?` | `Partial<Record<DecisionId, unknown>>` | **new (FR-001)** | Snapshot of the values of this decision's `requires` as they stood when it was decided. Written by the completion writer from the store's current records for the module's `requires`; absent when the module declares no `requires`. Never mutated after the write — a re-answer replaces the whole record. |
| `offered?` | `unknown` | **new (FR-001)** | The pre-filled value the author overrode (the saved answer's `proposal.value` when the completed value differs). Absent when nothing was offered or the offer was accepted. Shown beside an override by later specs (092 FR-003); 088 only stores it. |
| `step?` | `string` (a step id) | **new (FR-001)** | Display metadata only: the step that asked the question when the record was written. Never a key, never read by routing, ordering, or gating. A moved question keeps its record and its history; only this label changes on the next answer. |

**Invariants**
- One record per decision id, ever. Re-answering replaces the record (the superseded
  history lives in the decision *log*, §4 — not in the store).
- The store is the *only* saved record of a survey-question answer (FR-006). Drafts,
  the log, and selectors all read from it; none keeps a second copy.
- A record with no entry in the set is simply undecided — `DecisionSet` stays
  `Partial` by design (gated-out or never-asked decisions have no placeholder).

## 2. Provenance vocabulary (extended)

Location: `decisions/decisionTypes.ts:157` — **studio-local** type, not the contracts
`DecisionProvenance` of the 053 record.

```ts
export type DecisionProvenance = "asked" | "extracted" | "default" | "derived";
```

- `"derived"` is **declared by 088 (FR-002) and first written by 090** (computed
  values such as carve proposals). No 088 code path writes it; a test pins that the
  value exists in the union and that the draft round-trip preserves a record
  carrying it (forward compatibility for 090, whose records 088's loader must not
  reject).
- Completion mapping (research D-05): proposal accepted unchanged + source `base` →
  `extracted`; proposal accepted unchanged otherwise → `default`; everything else →
  `asked`.

## 3. decisionStore (new)

Location: `packages/studio/src/stores/decisionStore.ts` (zustand 5, the
`surveyAnswerStore` idiom).

**State**
```ts
interface DecisionStoreState {
  decisions: DecisionSet;
  record: (r: Decision) => void;          // replace-or-insert by r.id
  recordAll: (rs: readonly Decision[]) => void;
  reset: () => void;                       // start-over / new project only
}
```

**Module-level helpers** (the draft-persistence idiom, mirroring
`getSurveyAnswerSnapshot` / `applySurveyAnswerSnapshot` / `peekStepAnswers` in
`stores/surveyAnswerStore.ts`):
- `getDecisionSnapshot(): DecisionSet` — the persisted shape; it *is* the draft's
  `decisions` slice, no transformation.
- `applyDecisionSnapshot(s: DecisionSet): void` — direct `setState`, not reset-first.
- `peekDecision(id): Decision | undefined` — non-subscribing read.
- Selectors: `selectTrack(decisions)`, `selectTouchSeedSource(decisions)` — the
  FR-005 replacements for the deleted session fields.

**Rules**
- The store writes no other store and reads no other store (the touch-draft side
  effect that today rides on `setTouchSeedSource` is re-homed to the writer's call
  sites — research D-06).
- `reset()` is called only from the same start-over / new-project paths that reset
  `surveyAnswerStore` today.

## 4. Decision log re-keying (FR-008)

Location: `packages/studio/src/decisions/decisionLogStore.ts`.

- `slotKeyOf` (`:148-158`) changes for the `survey-answer` payload kind only: the slot
  becomes the **decision id** (resolved from `payload.questionId` through the question
  registry's `provides`), keeping the `\u0000` delimiter discipline and the payload-kind
  discriminator. `editor-action` and `base-contribution` slots are unchanged in 088 —
  they have no decision id until 090 gives their steps modules.
- `DecisionEntry.stepId` is untouched: it becomes display metadata in fact (it already
  is the only place the step survives), satisfying "step id kept as display metadata".
- **No persisted migration:** slot keys are computed from stored fields at
  append/supersede time, never stored. A hydrated v1 record therefore re-keys itself
  under the new function; v1 log entries whose question no longer resolves to a
  decision keep their legacy `stepId`-based slot (fallback inside `slotKeyOf`), so
  their history is preserved rather than orphaned by the re-key.

## 5. Draft envelope v2 (FR-007)

Location: type in `packages/studio/src/lib/draftTypes.ts` (`DurableDraft`, `:107-143`);
version + key in `packages/studio/src/lib/draftPersistence.ts` (`DRAFT_VERSION` `:93`,
`draftKey` `:100-105`, envelope construction `:776-794`).

**Changes**
- `DRAFT_VERSION`: `1 → 2`. New drafts write under `ks.draft.<projectKey>.v2`.
- `DurableDraft` gains `decisions?: DecisionSnapshot` where
  `DecisionSnapshot = DecisionSet` (the store snapshot, §3). Optional in the type so
  the migration output and partial envelopes type-check; every v2 draft the writer
  produces carries it.
- `surveyAnswers` slice: survey-question answers are **removed** from what the writer
  persists (they live in `decisions`); within-step `position`, step `status`, and
  **gallery-step answers stay** until 090 retires them (spec ledger). The snapshot
  type is unchanged — the writer filters, the reader tolerates either shape.
- `traversal` slice: `selectedTrack` and `touchSeedSource` are no longer written
  (the fields leave `TraversalSnapshot` with FR-005); a v2 reader ignores them if a
  migrated envelope still carries them.
- `workingCopy` slice: unchanged in 088 (retired by 093), except it no longer
  contains `phaseAnswersByStep` (§6).

**v1 → v2 migration** (`migrateDraftEnvelope`, new in `lib/draftPersistence.ts`,
running before every version gate and in the boot scan — research D-04):
1. Answers: for each `surveyAnswers.steps[*].answers[*]`, resolve question id →
   decision id(s) via `questionRegistry[qid].provides`; write a record
   `{ id, value, provenance, step }` (provenance per §2's mapping from the saved
   answer's `origin`/`proposal`; `step` = the v1 step key).
2. Session fields: `traversal.selectedTrack` → `authoring-track` record;
   `traversal.touchSeedSource` → `touch-seed-source` record (both `asked`).
   If both a session field and a migrated log/session copy disagree, the draft's
   session field wins (spec edge case) and the mismatch is logged to the console.
3. Orphans: a question id with no registry entry produces no record; it is collected
   into `migrationOrphans: Array<{ questionId, stepId, value }>` carried on the
   migrated envelope (not persisted past the load) and surfaced to the author —
   surface **OPEN-088-1** (plan.md). Never dropped silently.
4. Log: `decisionRecord` passes through unchanged (§4).

**State transitions**: `v1 envelope → (migrate) → v2 envelope → apply to stores`.
A v2 envelope loads directly. Any other version is rejected exactly as today.

## 6. Working-copy answer storage (FR-006)

Location: `packages/studio/src/stores/workingCopyStore.ts`.

- `phaseAnswersByStep` (field `:677`, maintained in `recordPhase` `:2056-2083`) is
  **deleted**. `recordPhase` keeps merging non-answer phase fields and the Phase C
  assignments path (`recordAssignments` `:2085-2098` unchanged).
- Readers of a phase's question answers use the new derived selector
  `selectPhaseAnswers(decisions, phase)` — answers grouped from `decisionStore` by
  the providing module's flow/phase membership — instead of stored state. The named
  consumer to re-point is the `mergePhaseResults` session derivation (`:1346-1352`).
- `phaseResults` itself is **not** deleted in 088 (it carries non-answer data —
  research §1d); it stops being *answer storage*.

## 7. Relationships

```text
QuestionModule (survey/types.ts)  --provides-->  DecisionId  <--record--  decisionStore
QuestionModule                    --requires-->  DecisionId  --snapshot--> Decision.inputs
StepHost.handleComplete ── recordAnswersAsDecisions ──> decisionStore
decisionStore ── getDecisionSnapshot ──> DurableDraft v2.decisions
DurableDraft v1 ── migrateDraftEnvelope (provides map) ──> DurableDraft v2
decisionStore ── selectors ──> advance() / resolveLocation() gatedBy evaluation
decisionLogStore.slotKeyOf ── resolves questionId via provides ──> decision-id slot
```
