# Contract: `PickerPane` variant + change-base navigation

UI contract — the identifiers a test or a future caller codes against.
`spec.md` has no dedicated "Verbatim Constraints" section for this feature;
the identifiers below are copied from the shipped source
(`packages/studio/src/components/PickerPane.tsx`,
`packages/studio/src/components/OutputScreen.tsx`) so this doc and the code
cannot drift.

## `PickerPane` props (`packages/studio/src/components/PickerPane.tsx`)

```ts
export type PickerPaneVariant = "full" | "shipping";

interface PickerPaneProps {
  artifact: PreviewArtifact;
  leftPct: number;
  dividerWidth: number;
  pickerSlot: ReactNode;
  scaffoldFormSlot: ReactNode;
  identityPanelSlot: ReactNode;
  kmnEditorSlot: ReactNode;
  variant?: PickerPaneVariant;   // default "full" — FR-001
  changeBaseSlot?: ReactNode;    // rendered in "shipping" only — FR-006
}
```

- `variant` omitted or `"full"` → mode toggle + editable picker slot render
  (cold-arrival / historical behaviour, FR-001).
- `variant="shipping"` → mode toggle and picker slot are suppressed; base
  renders as read-only provenance (FR-004); `changeBaseSlot` renders
  immediately after it if `baseKeyboard !== null`.
- `identityPanelSlot` / `kmnEditorSlot` render unconditionally in both
  variants, at the same tree position (FR-005).

## Test-facing identifiers

| Identifier | Kind | Where | Asserts |
|---|---|---|---|
| `output-base-provenance` | `data-testid` | `PickerPane.tsx` (`BaseProvenance`) | Read-only base display renders in `"shipping"` (US1 scenario 3) |
| `output-change-base` | `data-testid` | `OutputScreen.tsx` (change-base button) | The relocate-to-survey control is present and wired (US2 scenario 1) |
| `output-screen-root` | `data-testid` | `OutputScreen.tsx` (root container) | Existing — screen mount anchor, unchanged by this feature |

## aria-label / accessible-name identifiers

| i18n id | Applies when | Text (en) |
|---|---|---|
| `picker.pane.label.shipping` | variant `"shipping"` | "Keyboard details pane" |
| `picker.pane.label` | variant `"full"` | "Picker pane" |
| `picker.shipping.heading` | variant `"shipping"` | "Your keyboard" |
| `picker.shipping.intro` | variant `"shipping"` | "Check the details below, then download or submit your keyboard from the right." |
| `picker.shipping.provenance.heading` | variant `"shipping"` | "Built from" |
| `picker.shipping.provenance.name` / `.id` / `.script` | variant `"shipping"` | "Name" / "Base ID" / "Script" |
| `output.changeBase.label` | variant `"shipping"`, `baseKeyboard !== null` | "Change base keyboard" |
| `output.download.aria.ready` | download enabled | `Download keyboard ${downloadKeyboardId} as zip` — MUST use `resolveOutputKeyboardId`'s value (FR-008/D4) |
| `output.download.aria.kmp` | `.kmp` enabled | `Download keyboard ${downloadKeyboardId} as an installable Keyman package` |

`downloadKeyboardId` in both aria-label ids above MUST be
`resolveOutputKeyboardId(identity, baseKeyboard)` — never a
`pickerMode`/`scaffoldSpec`-derived expression (FR-008; this is the D4 fix
and the regression it guards against).

## `resolveOutputKeyboardId` (`packages/studio/src/lib/outputKeyboardId.ts`)

```ts
export function resolveOutputKeyboardId(
  identity: Pick<IdentityPatch, "keyboardId"> | null | undefined,
  baseKeyboard: { id: string } | null | undefined,
): string
```

Contract: returns `identity?.keyboardId ?? baseKeyboard?.id ?? ""`. Both
`OutputScreen`'s aria-label derivation and `serializeWorkingCopy`'s filename
derivation MUST call this function; neither may re-derive the expression
inline (FR-008).

## `surveySessionStore` action (`packages/studio/src/stores/surveySessionStore.ts`)

```ts
backToChooseBase: () => void;
```

Contract: rewinds `history` to the prefix walked before `choose_base` was
first reached (or empty history if `choose_base` is absent from the stack);
clears `baseConfirmed`. Never mutates the working copy and never pushes a
forward `advance` entry (FR-006, FR-007).

## Variant-selection contract (`OutputScreen`)

```ts
const instantiated = useWorkingCopyStore((s) => s.isInstantiated());
// ...
<PickerPane variant={instantiated ? "shipping" : "full"} ... />
```

Contract: the variant expression MUST read `isInstantiated()` through a live
Zustand selector (re-evaluated on every store change), never a mount-once
read, ref, or effect-with-empty-deps snapshot (FR-002, FR-003).
