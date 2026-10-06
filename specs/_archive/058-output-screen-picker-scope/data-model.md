# Phase 1 Data Model: Output-screen picker scope

No new persisted state and no `packages/contracts` schema change (see
research.md's non-decision). The entities below are render-time/derived or a
single new store action — captured here because Key Entities in `spec.md`
names them as the objects this feature introduces or reshapes.

## `PickerPaneVariant`

```ts
export type PickerPaneVariant = "full" | "shipping";
```

- **Kind**: Presentational mode, not stored state. Computed fresh on every
  render from `isInstantiated()` — never written to any store, never
  serialized (Key Entities: "Derived, never stored").
- **Values**:
  - `"full"` — default. Renders the mode toggle, the editable base picker
    slot, the scaffold-form slot, and (open-mode only) `MetadataCard`. Used by
    cold arrival at `#output` (no working copy yet) — the one remaining
    caller of the historical behaviour after spec 057 removed `PreviewScreen`.
  - `"shipping"` — renders `BaseProvenance` (read-only) plus the
    `changeBaseSlot`; suppresses the mode toggle, picker slot, scaffold-form
    slot, and `MetadataCard`. Selected once `OutputScreen` observes an
    instantiated working copy.
- **Shared across both values**: `identityPanelSlot` and `kmnEditorSlot`
  render at the same position in a single `<section>` regardless of variant —
  this is what lets a mid-visit flip (late instantiation settling) reconcile
  in place instead of unmounting a half-typed identity form (FR-005).
- **Transition rule**: `full → shipping` exactly once per visit, the instant
  `isInstantiated()` flips true (live subscription — FR-003). No
  `shipping → full` transition exists within a visit; a working copy is never
  un-instantiated from Output.

## `BaseProvenance` (row set)

A fixed, non-persisted projection of `BaseKeyboard` shown in the `"shipping"`
variant:

| Field | Source | Label id |
|---|---|---|
| `name` | `kb.displayName` | `picker.shipping.provenance.name` |
| `id` | `kb.id` | `picker.shipping.provenance.id` |
| `script` | `kb.script` | `picker.shipping.provenance.script` |

Rows are keyed by **field name**, not by value — `displayName`/`id`/`script`
readily coincide in real base-keyboard data (e.g. a base whose display name
equals its id), and a duplicate React `key` silently drops a row.

## `resolveOutputKeyboardId(identity, baseKeyboard): string`

```ts
function resolveOutputKeyboardId(
  identity: Pick<IdentityPatch, "keyboardId"> | null | undefined,
  baseKeyboard: { id: string } | null | undefined,
): string
```

- **Rule**: `identity?.keyboardId ?? baseKeyboard?.id ?? ""`.
- **Callers**: `OutputScreen` (download/`.kmp` aria-labels) and
  `serializeWorkingCopy` (emitted `<id>-<version>.zip` filename). Both MUST
  call this function rather than re-deriving the expression inline (FR-008) —
  it is the single source of "which keyboard id does output use."
- **Not a contract-schema type** — a plain function over existing
  `IdentityPatch`/`BaseKeyboard` shapes, not a new persisted field.

## `surveySessionStore.backToChooseBase` (new action)

- **Kind**: Store action, part of the existing `backTo*` family alongside
  `backToTouchSeedSource` / `backToUnfinishedGallery`.
- **Effect**: rewinds `history` to the prefix walked *before* `choose_base`
  was first reached (empty history if `choose_base` is absent from the
  stack — a hydrated draft that never walked it); clears `baseConfirmed`.
- **Not** a forward push (`advance`) — see research.md's decision entry for
  why FR-007 (no stale forward entries) rules that out.
- **Does not mutate the working copy.** It only repositions survey
  navigation state; the actual re-base (or no-op on same-base reselection)
  happens later, at `choose_base`, through the pre-existing
  `confirmRebaseTo` / `instantiateFromBaseIfConfirmed` path — unchanged by
  this feature (FR-006).

## State transitions summary

```
Output mount
  └─ isInstantiated() == false → variant = "full"  (cold arrival, US3)
       └─ author selects + confirms a base → isInstantiated() flips true
            └─ variant flips to "shipping" IN PLACE (no remount, FR-005)
  └─ isInstantiated() == true  → variant = "shipping" (US1, common path)
       └─ author clicks "Change base keyboard"
            └─ backToChooseBase() (rewinds survey history, clears baseConfirmed)
            └─ navigateTo("survey")  → lands at choose_base (US2)
                 └─ existing confirmRebaseTo gate decides commit/no-op/cancel
```
