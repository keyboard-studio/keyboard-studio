# Data model: Survey progress buttons live in the footer

Phase 1 output for [plan.md](plan.md). All of this is **ephemeral, in-memory UI state**. None of
it is persisted, serialized into the draft envelope, or written to the working copy or
VirtualFS. Every entry is rebuilt on the next mount, as with `stepWalkStore`.

## NavAction

One button the step offers right now.

| Field | Type | Required | Rule |
|---|---|---|---|
| `label` | `string` | yes | Already resolved through the `t` macro. Same text as the in-body button it replaces (FR-010). |
| `onClick` | `() => void` | yes | The step's **own** handler: for Back, the internal-walk back, never StepHost's boundary back directly (FR-011). Not compared by the equality guard. |
| `testId` | `string` | yes | The existing handle (FR-040) or the new handle from Appendix A (FR-041). |
| `disabled` | `boolean` | no | Default `false`. Same predicate as today (Appendix A "Gating"). |
| `ariaLabel` | `string` | no | Only where the body button had one (for example, the touch per-character position label). |
| `ariaDescribedBy` | `string` | no | The id of a hint or progress description **that is currently mounted** in the step body (FR-033, research R-09). Omit it when the hint is not rendered. |

## StepNavSpec

What one mounted step offers as navigation.

| Field | Type | Renders as |
|---|---|---|
| `back` | `NavAction?` | `Button variant="back" size="compact"` |
| `secondary` | `NavAction?` | `Button variant="secondary" size="compact"` (Skip) |
| `forward` | `NavAction?` | `Button variant="primary" size="compact"` (Next, Continue, Done, Confirm, Get started) |

Invariants:

- A slot that is absent renders nothing. There is no placeholder (US1 scenario 3).
- An empty spec (`{}`) is legal and renders no cluster.
- Order is fixed at `back`, `secondary`, `forward`, both in the DOM and visually (FR-002).

The gallery `ForwardButtonSpec` and `TouchForwardButtonSpec` map onto `forward` field for field.

## StepNavEntry (store row)

| Field | Type | Rule |
|---|---|---|
| `owner` | `string` | The `useId()` token of the publishing hook instance (research R-04). |
| `spec` | `StepNavSpec` | Holds stable wrapper handlers. The equality guard compares descriptive fields only (research R-03). |

## StepNavStore state

```
entries: Record<stepId, StepNavEntry>
```

`stepId` is a manifest step id supplied by StepHost's `StepNavContext`, or
`STANDALONE_STEP_ID` when no provider is present (research R-01 and R-02).

## Transitions

| Event | Effect | Guard |
|---|---|---|
| `publish(stepId, owner, spec)`, no entry | Insert. | |
| `publish`, same owner, equal spec | **No-op**, and subscribers are not notified (FR-050). | `sameSpec` |
| `publish`, same owner, changed spec | Replace. | |
| `publish`, **different** owner, live entry | Keep the existing entry; `console.error` in DEV (FR-013). | owner check |
| `clear(stepId, owner)` | Delete, if `entries[stepId].owner === owner`; otherwise no-op. | owner check |
| `reset()` | Delete everything (start-over, new project, and the test `afterEach`). | |

The footer's read rule is: render `entries[activeStepId]` only (FR-012; 057 FR-062). No entry
means no cluster, and no fallback is ever synthesized (FR-013).

## Footer visibility

The existing gate is `journeyStarted = walks non-empty || projectLabel !== null`. FR-021 adds a
third disjunct: `entries[activeStepId]` exists and has at least one slot.
