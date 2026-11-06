# Data model: Open an existing keyboard (spec 111)

Phase 1 of [plan.md](plan.md). All state lives in the existing stores and the draft envelope (Constitution Article III). Nothing here adds a server-side store.

## Working copy on Open (existing store, new rules)

| Field | Today | On Open |
|---|---|---|
| `instantiationMode` | `"adapt-existing"` | unchanged value; UI says "Open" |
| `startVfs` | source files without the `.kps` | **all** keyboard files, `.kps` included with `../build/` entries rewritten (research R3) |
| `startIr` | parse of the original `.kmn` | parse of the **current** `.kmn` text; replaced on each applied code edit (R1) |
| `ir` | replay of decisions on `startIr` | same |
| `startKeyboard` | catalog entry | plus `source: SourceRef` |

**Invariant (Open)**: `startIr` equals the parse of `startVfs`'s `.kmn`, always. An applied code edit writes the text and sets both, in one store update.

## SourceRef (new, in the working-copy snapshot)

| Field | Type | Notes |
|---|---|---|
| `owner` | `"keymanapp" \| "keyboard-studio"` | the repository the keyboard was opened from |
| `repo` | `"keyboards"` | |
| `commit` | string (SHA) | pinned at open; printed in the PR body |
| `path` | string | e.g. `release/sil/sil_cameroon_qwerty` |
| `alternative` | `{ owner, commit, newer: boolean } \| null` | set when the other repository's copy differed; drives the warning (FR-003) |

## Source choice (decision)

The existing `authoring-track` decision, value `"adapt"`, recorded at the Open entry (R6). The repository choice itself is part of `SourceRef`; it's a starting-point fact, not a decision, so switching repositories is a starting-point switch.

## Baseline (new, criteria slice of the draft envelope)

| Field | Type | Notes |
|---|---|---|
| `takenAt` | ISO time | at open |
| `failing` | `Set<FindingKey>` | `FindingKey = "${lintRuleId}:${file}"` (R5) |
| `unresolvable` | `Set<criterionId>` | criteria that couldn't be checked at load; never "new" later |

Classification: a current failing finding is **pre-existing** if its key is in `failing`; otherwise **new**.

## Review note (new, criteria slice)

| Field | Type | Notes |
|---|---|---|
| `key` | `FindingKey` | the new failure it justifies |
| `criterionId` | string | for the PR body |
| `text` | string | author text, non-empty after trim |
| `writtenAt` | ISO time | |

Lifecycle: created by the author on a new failure → printed in the PR body → **dropped** automatically when its key stops failing (FR-026). Never a decision.

## Suggested fix (transient, recomputed)

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable per (kind, target) |
| `kind` | `"upgrade" \| "consistency" \| "docs" \| "generate-missing"` | |
| `findingKey` | `FindingKey \| null` | the finding it resolves, if any |
| `preview` | `{ file, before, after }[]` | shown before accepting (FR-028) |
| `status` | `"pending" \| "accepted" \| "declined"` | accepted and declined are recorded (decision record, spec 053) so they aren't re-offered |

Accepting applies a text edit, so it becomes a new starting point (R1).

## Consistency delta (transient)

Computed per Apply: `{ addedPhysical, removedPhysical, addedTouch, removedTouch, addedLayers, removedLayers }`, scoped to what this change altered (R10). Feeds `consistency` suggestions only.

## State transitions

```
open ──load──▶ baseline taken ──edit/apply──▶ findings reclassified
                                   │                 │
                                   │       new failure ─▶ note? ─▶ submit gate
                                   ▼
                     suggestions offered ─accept─▶ text edit ─▶ new starting point ─▶ replay
```
