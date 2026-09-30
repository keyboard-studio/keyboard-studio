# Data Model: Legible decision trail

Entities this feature introduces or reshapes. Field names are the contract — see [contracts/record-shape.contract.md](contracts/record-shape.contract.md) for the obligations that ride with each change.

Two representations must move together for anything under `packages/contracts`: the TypeScript interface in `src/decisionRecord.ts` and its zod mirror in `src/schemas.ts`, bound by the compile-time drift guards at `schemas.ts:789-793`. A change to one that is not made to the other fails the build, which is the intended behaviour, not an obstacle.

---

## 1. `EditorActionSummary` — reshaped (`packages/contracts/src/decisionRecord.ts`)

One editor step's activity, aggregated. Four dimensions, all retained.

| Field | Before | After | Notes |
|---|---|---|---|
| `keysRemoved` | `number` | `number \| undefined` | Producer unchanged: `getDeletionCounts().nodes + .items`. |
| `keysAdded` | `number` (always `0`) | `number \| undefined` | **Gains a producer** — newly-occupied host keys at the mechanisms stage (research D-05). |
| `mechanismsAssigned` | `number` (always `0`) | `number \| undefined` | **Gains a real producer** — the store's phase-C physical assignments (research D-04). |
| `touchKeysAffected` | `number` | `number \| undefined` | Producer unchanged. |
| `sample` | `readonly string[]` | unchanged | Bounded by `EDITOR_ACTION_SAMPLE_LIMIT` (12). |
| `sampleTruncated` | `boolean` | unchanged | States the bound when it bites. |

**Validation rules.**
- A present value is a non-negative integer. Absence is legal for all four counts and means *not measured*; a present `0` means *measured and unchanged* (FR-005).
- The zod mirror uses `.optional()`, never `.default(0)` — a default would re-introduce at the record boundary exactly the coercion FR-005a forbids.
- `keysAdded` and `mechanismsAssigned` never describe the same edit: a reassignment of an already-occupied key increments only `mechanismsAssigned` (FR-003).

**Producer/consumer matrix.** Every cell must be either a real producer or an explicit absence; FR-004 forbids a permanently-zero dimension, and FR-029 requires a test that drives each producer non-zero through the production path.

| | `gallery_edit` | `mechanism_edit` | `touch_edit` |
|---|---|---|---|
| `keysRemoved` | store deletion counts | absent | absent |
| `keysAdded` | absent | newly-occupied host keys | absent |
| `mechanismsAssigned` | absent | phase-C physical assignments | absent |
| `touchKeysAffected` | store touch deletions | absent | assignment targets |

Absence here is deliberate and is the FR-005 reading: a gallery edit does not *measure* mechanisms, so it reports no value for them rather than a zero that reads as "mechanisms were considered and left alone".

---

## 2. `DecisionImpact` — widened (`packages/contracts/src/decisionRecord.ts`)

What a decision did to the produced package. Three states, all positive statements; the `"captured"` variant is the one that changes.

**Before** — one file:

```ts
{ state: "captured"; path: string; hunks: readonly DiffHunk[]; magnitude: { added; removed } }
```

**After** — a set of per-file changes plus an aggregate and an optional sharing statement:

```ts
{
  state: "captured";
  files: readonly DecisionFileChange[];   // >= 1; one per changed text file
  magnitude: { added: number; removed: number };  // aggregate across `files`
  sharedWith?: readonly string[];         // co-decision entryIds; absent when sole
}
```

with

```ts
interface DecisionFileChange {
  path: string;                  // VFS path, e.g. "source/foo.kmn", "source/foo.kps"
  hunks: readonly DiffHunk[];
  magnitude: { added: number; removed: number };
}
```

`{ state: "none" }` and `{ state: "unavailable"; reason }` are unchanged, and remain distinct from each other and from a captured-but-empty change (FR-020).

**Validation rules.**
- `files` is non-empty. A capture with no changed file is `{ state: "none" }`, not an empty set — the distinction FR-011 rests on.
- Only text entries are compared: an entry with `isBinary === true` is skipped, never diffed (FR-016).
- Every path comes from the same projection that produces the shipped keyboard (FR-018).
- `sharedWith` names *other* entries only; an entry never lists itself. Its presence is what licenses the trail to say the change is shared (FR-019).
- Aggregate `magnitude` is the sum over `files`, so an existing consumer that reads only `magnitude` keeps working.

**State transitions.** Unchanged from 053: `impact` is absent (never captured) → a value (captured once) → `null` (captured then shed to fit the save budget). The three are distinguishable and the trail says different things about each. Widening the captured shape enlarges what gets shed; 053's truncation rule bounds it and this feature must not relax it.

---

## 3. `BaseContribution` — new payload (`packages/contracts/src/decisionRecord.ts`)

What the working copy inherited when it was instantiated. Recorded once, at `choose_base`, as the baseline every later count is read against. A third member of `DecisionPayload`, alongside `"survey-answer"` and `"editor-action"`.

```ts
{
  kind: "base-contribution";
  baseId: string;                        // the base chosen
  baseDisplayName: string;               // author-facing, from BaseKeyboard
  startingKeyCount?: number;             // same unit as keysRemoved (nodes + items)
  derivedAxes: readonly string[];        // axis ids the studio derived from the base
  inheritedMetadata: readonly { field: string; value: string }[];
  instantiationMode: "new-from-base" | "adapt-existing";
}
```

**Validation rules.**
- `startingKeyCount` follows the same absence convention as the editor counts: absent means the inventory could not be measured, never `0`. `0` is reserved for a genuinely empty starting layout (the from-scratch edge case).
- The unit is `nodes + items` as counted by `toRailNodes`, matching `keysRemoved` — FR-034 requires a numerator and denominator that divide.
- `derivedAxes` carries axis **ids**, not prose. The trail renders each through the catalog; an id must never reach author-facing text (FR-008).
- `inheritedMetadata.field` is likewise a code, rendered through the catalog.
- The entry is written only when the store shows an instantiated working copy. No instantiation, no entry — a fabricated zero baseline is worse than none (research D-11).

**Relationship to provenance.** Distinct axes, deliberately. `BaseContribution` says *what the session started with*; `DecisionProvenance.agency: "base-derived"` says *whose value a later recorded answer is*. FR-032 makes the second reachable by wiring `resolveProposal`; this entity is the first, and neither replaces the other.

---

## 4. `HeadlineSpec` — reshaped (`packages/studio/src/decisions/headline.ts`)

Which catalog message a headline uses and the values it interpolates. Studio-side, not persisted. The full surface is in [contracts/headline-spec.contract.md](contracts/headline-spec.contract.md).

The shape change is that **no variant carries an identifier**:

| Variant | Before | After |
|---|---|---|
| `chose` / `acceptedSuggested` / `fromBase` | `question: string` (= `payload.questionId`) | `question: QuestionName` — a resolved label, or a marker selecting the FR-014 fallback |
| `editorStep` | `editor: string` (= `actionType`) plus four always-present counts | `stage: EditorActionType` (a code the component maps to a message) plus `dimensions: readonly HeadlineDimension[]` — only those with a present, non-zero value |
| `baseContribution` | — | new: base name plus the contributions actually present |

`HeadlineDimension` is `{ kind: "keysRemoved" | "keysAdded" | "mechanismsAssigned" | "touchKeysAffected"; count: number }`. A dimension that is absent (unmeasured) or zero never appears, which makes FR-011 and SC-004 properties of the selection rather than of the rendering — and therefore unit-testable without a DOM, as FR-013 requires.

An editor step with an empty `dimensions` array is not rendered as an empty list: the component selects a distinct "changed nothing" message (FR-011, US1 scenario 5). A step with *no measured dimension at all* selects a third message — "not measured" — which is what keeps a pre-feature record from reading as a step that did nothing (D-01, SC-011).

---

## 5. `StageGroup` — new, presentation only (`packages/studio/src/decisions/stageGroups.ts`)

A stage, its decisions in order, and its one-line account. Derived on render from the record and the flow manifest. **Not persisted and not a second record** — Story 5 can be cut without a record-format change.

```ts
interface StageGroup {
  stepId: string;                          // manifest step id, or PRE_IDENTITY_STEP_ID
  entries: readonly DecisionEntry[];       // append order within the stage, history included
  rollUp: StageRollUp;                     // the collapsed one-liner's source
}
```

**Ordering rule.** Groups are ordered by the stage's position in `manifest` (FR-022), so the trail's order cannot drift from the order the author walked. A `stepId` absent from the manifest — `PRE_IDENTITY_STEP_ID`, or a step a later build removed — sorts first and renders under a generic heading rather than being dropped (FR-024: grouping hides nothing).

**Roll-up rule.** `rollUp` describes the stage's **net effect**, computed from its *effective* (non-superseded) entries: for an editor stage, the latest effective entry; for a question stage, a count of effective answers. Superseded entries stay inside `entries` and remain visible (FR-026) but are not summed — editor counts are cumulative per step, so summing a revisit double-counts (research D-02).

A stage with no recorded decision produces no group, or a group explicitly marked untouched. It is never presented as a stage that made changes (FR-025).

---

## 6. Question audit label — new, content-owned, optional

An override for the author-facing name a question is given in a headline. Not a code entity: a third field in the existing flow-question catalog under the established key convention.

- **Key**: `content.flowQuestion.<id>.audit_label`
- **Source**: the question module's `definition.audit_label`, extracted alongside `prompt` / `label` / `body` / `help_text`
- **Cardinality**: optional per question, optional per locale
- **Resolution order**: `audit_label` → `prompt` → FR-014 fallback prose

Authored only where the question's prompt reads badly as a headline. Because a prompt is always present for a live question, the fallback carries no routine traffic — it exists for a record referencing a question the build no longer has. Parity rules in [contracts/catalog-audit-label.contract.md](contracts/catalog-audit-label.contract.md).
