# Data Model: Per-keyboard decision audit (CYOA Phase 1)

Entities this feature introduces, and the two existing shapes it extends. Canonical types live in `packages/contracts/src/decisionRecord.ts` with a zod mirror and drift guards in `schemas.ts` (see [research.md](research.md) D-01).

---

## DecisionEntry

One recorded decision. Append-only: an entry is never edited or deleted once written.

| Field | Type | Required | Notes |
|---|---|---|---|
| `entryId` | `string` | yes | Stable, unique within the record. Assigned at append. Supersede links point at it. |
| `stepId` | `string` | yes | The manifest step this decision belongs to. Matches a `Step.id` from `steps/manifest.ts`, or the pending-identity placeholder before a step is known. |
| `kind` | `"survey-answer" \| "editor-action"` | yes | The two event kinds, named per [specs/032-journey-corpus](../032-journey-corpus/spec.md) FR-002 (D-10). Discriminates `payload`. |
| `payload` | `SurveyAnswerPayload \| EditorActionPayload` | yes | See below. Narrowed on `kind`. |
| `provenance` | `DecisionProvenance` | yes | How the value came to be, and where any proposal came from. |
| `recordedAt` | `number` | yes | Epoch ms at append. Ordering key of last resort; `entryId` sequence is authoritative. |
| `supersedes` | `string \| null` | yes | The `entryId` this entry replaces, or `null`. Never a list — one entry replaces at most one. |
| `impact` | `DecisionImpact \| null` | no | The captured attributed change, or `null` when not captured. A **sheddable payload** (D-09). |

### SurveyAnswerPayload

| Field | Type | Required | Notes |
|---|---|---|---|
| `questionId` | `string` | yes | The question answered. Matches the flow question `id`, as in the completed-instance format. |
| `answerType` | `AnswerType` | yes | Reused verbatim from `packages/contracts/src/pattern.ts` — not redeclared. |
| `value` | typed per `answerType` | yes | Same value discipline as `SurveyAnswer`: `string[]` for `char-list`, `boolean` for `boolean`, `string` otherwise. |

`SurveyAnswer` itself is **not** extended or wrapped (D-01). This payload is structurally answer-compatible so a record renders into the completed-instance `answers` array without transformation.

### EditorActionPayload

| Field | Type | Required | Notes |
|---|---|---|---|
| `actionType` | `"gallery_edit" \| "mechanism_edit" \| "touch_edit"` | yes | The 032 FR-002 vocabulary, unchanged. |
| `summary` | `EditorActionSummary` | yes | Structured counts and categories, not a prose string — the studio renders localized text from it (FR-016). |

`EditorActionSummary` carries the net effect of the step: counts by category (keys removed, keys added, mechanisms assigned, touch keys affected) plus a bounded sample of affected identifiers for the "very large aggregated edits" edge case. It is structured rather than pre-rendered so the same record produces English in the pull-request body and the author's locale in the trail.

### Validation rules

- `entryId` is unique across the record; a duplicate on load is a malformed record (see *Version tolerance*).
- `supersedes`, when non-null, MUST name an earlier `entryId` present in the same record. A dangling link degrades to `null` with the entry retained — never a load failure.
- An entry MUST NOT supersede an entry that is itself already superseded by a third entry. Supersession forms chains, not trees: at most one live entry per `(stepId, questionId)` for survey answers, and per `stepId` for editor actions.
- `kind` and `payload` MUST agree. A mismatch is malformed.
- Appending MUST NOT mutate any existing entry. Enforced by the store slice exposing only append and read.

---

## DecisionProvenance

| Field | Type | Required | Notes |
|---|---|---|---|
| `agency` | `"base-derived" \| "tool-proposed" \| "hand-set"` | yes | Two literals reused verbatim from `TouchKeyProvenance` (D-03). `"tool-proposed"` means the stored value is the tool's proposal unmodified; an overridden proposal is `"hand-set"`. `"base-derived"` is carried from the base keyboard whether or not the author confirmed it. |
| `source` | `DecisionProposalSource` | no | Where a proposal originated: `"langtags"`, `"cldr"`, `"corpus"`, `"axis-fill"`, `"base"`, `"identity"`, `"region"`, `"derived-from-axis"`. Lifted from the [specs/002-defaults-engine](../002-defaults-engine/spec.md) "Provenance label" entity. Absent for `"hand-set"` values with no prior proposal. |

Agency and source are independent axes, which is what lets a headline distinguish "Accepted suggested autonym from langtags" from "Chose autonym" (FR-013).

---

## DecisionImpact

The concrete source change attributable to one decision. Derived on request for counterfactuals, captured at the step boundary for editor actions (FR-008, D-04/D-05).

| Field | Type | Required | Notes |
|---|---|---|---|
| `state` | `"captured" \| "none" \| "unavailable"` | yes | See the state rules below. |
| `hunks` | `DiffHunk[]` | when `captured` | Unified line hunks over the emitted `.kmn` text. Produced by the engine's line differ. |
| `path` | `string` | when `captured` | The projected file the hunks apply to. |
| `magnitude` | `{ added: number; removed: number }` | when `captured` | Line counts, used by the headline and by the bounded pull-request summary. |
| `reason` | `ImpactUnavailableReason` | when `unavailable` | A structured code, not prose (D-11): a lock-gate dependency, or no re-derivable write path in this build. |

### State rules

- **`captured`** — a change was derived and is stored. `hunks`, `path`, and `magnitude` are present.
- **`none`** — the decision demonstrably changed nothing in the source (e.g. an answer that only routes to a later question). This is a *positive* result, rendered as "changed nothing in the source", never as an empty diff (spec Edge Cases).
- **`unavailable`** — the isolated change cannot be derived, with `reason` explaining why. Rendered as a summary plus explanation (FR-011); never as an empty or partial change.

`state: "none"` and `state: "unavailable"` are deliberately distinct. Collapsing them would make "this decision was inert" indistinguishable from "we cannot tell", which is the failure the spec's Edge Cases and FR-011 both call out.

An `impact` of `null` on the entry means *not captured yet or shed* — distinct from all three states above, and the reason the trail can say "detail was dropped to stay within the save limit" rather than implying inertness.

---

## DecisionRecord

The ordered, append-only collection for one keyboard. Part of that keyboard's saved state; the single source of the trail, the pull-request summary, the packaged sidecar, and the flow-map overlay.

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | `string` | yes | Self-describing format tag, so an unzipped record identifies itself without the studio (FR-020's resumption job). |
| `version` | `number` | yes | Record-format version, independent of `DRAFT_VERSION`. |
| `keyboardId` | `string \| null` | yes | `null` while the keyboard has no permanent identity (FR-004). |
| `entries` | `DecisionEntry[]` | yes | Append order. The order the trail renders and the summary lists. |
| `truncated` | `{ shedCount: number } \| null` | yes | Set by the shed policy (D-09). Non-null means detail payloads were dropped; the trail must say so. |

### Invariants

- **Monotonic non-decreasing entry count** (SC-002): the only mutation is append. Navigation, revisits, and reloads never reduce `entries.length`.
- **Every superseded entry stays retrievable** (SC-002): superseding appends; it does not remove. Superseded entries default to collapsed in the trail (spec Assumptions) but are always present in the record.
- **Artifact independence** (FR-006, SC-006): nothing in this entity is read by any projection, mutation, or output path that produces the keyboard. An identical session with and without recording produces an identical artifact.
- **Identity carry-forward** (FR-004): entries recorded while `keyboardId` is `null` are retained verbatim when the identity is assigned; only `keyboardId` changes.

### Version tolerance (SC-009)

- An absent record loads as an empty record. The keyboard loads normally.
- An unrecognised `version` or a record failing schema validation loads as far as it can parse: valid entries are kept, the rest are dropped, and the trail states that it is showing a partial record. A malformed record never prevents the keyboard from loading.
- A record written by this build and read by a build without the feature is ignored as an unknown optional field.

---

## Extended existing shapes

Two existing types gain additive optional fields. Neither is a locked contract in Article I's sense, and neither takes a version bump.

### `DurableDraft` (`packages/studio/src/lib/draftTypes.ts`)

Gains `decisionRecord?: DecisionRecordSnapshot`. Optional rather than a `DRAFT_VERSION` bump, following the documented `phaseBDraft` precedent: a record written by an older build simply has no field, and `loadDraft` treats that as an empty record rather than discarding an otherwise-good draft (D-08).

### `ReducerDeps` (`packages/studio/src/steps/reducer.ts`)

Gains an injected `recordDecision` callback. Injection rather than import because the `steps/` layer may not import `stores/`, `lib/`, or `components/` — the same reason `setTouchSeedSource` is injected today (D-02).

---

## State transitions

A decision's lifecycle has exactly three transitions, and only the first two write:

1. **Append** — a step completes; one entry per survey answer, or one aggregated entry per editor step. `supersedes` is `null` on a first visit.
2. **Supersede** — the author revisits and changes something. A *new* entry is appended with `supersedes` set to the entry it replaces. The earlier entry is untouched. This applies identically to a revisited survey answer (FR-003) and a return visit to a completed editor step (FR-002).
3. **Freeze** — the project transitions to `status: "submitted"` in the existing project index. The record becomes read-only and stays viewable (spec Edge Cases). No new entries are appended.

A revisit that changes nothing appends nothing: re-recording an identical value for the same `(stepId, questionId)` is a no-op, so navigating back and forward without editing does not inflate the record.
