# Contract: key-edit operations — the `move` addition and the widened field set

**Feature**: 061-touch-editor-parity · **Extends**
[specs/058-touch-key-editor/contracts/key-edit-overlay.md](../../058-touch-key-editor/contracts/key-edit-overlay.md),
which stays authoritative for everything this file does not restate.

Owner: `packages/engine/src/pattern-apply/keyEditOps.ts` (the union and the field set),
`applyKeyEditsToLayout.ts` (IR path) and `applyKeyEditsToRawJson.ts` (Case B raw-JSON path).

---

## 1. What changes

| Change | Shape |
|---|---|
| `EditableKeyFields` gains four fields | `hint?: string` · `width?: number` · `pad?: number` · `layer?: string` |
| `KeyEditOperation` gains an eighth kind | `MoveKeyOp` |
| `KeyIdMintingPath` gains a fifth path | `"inherited"` |
| `TouchKeyFindingCode` gains two codes | `TOUCH_KEY_ROW_CROWDED` · `TOUCH_KEY_KEYCAP_MISMATCH` |

Nothing is renamed, retyped or removed. Every existing operation kind, applier signature and
overlay-replay guarantee is unchanged.

**Not a locked-schema change.** `EditableKeyFields` and `KeyEditOperation` are engine-internal:
neither appears in `packages/contracts/src/schemas.ts`, neither has a zod mirror, and neither is a
`Pattern` or `Criterion` type. Constitution Article I is not engaged. All four admitted fields
already exist on `TouchKeyIR`, where `layer` is documented as "the authoritative, editable view the
spec-058 key editor reads and writes".

## 2. `MoveKeyOp`

```ts
export interface MoveKeyOp extends KeyEditOperationBase {
  readonly kind: "move";
  readonly direction: "left" | "right" | "up" | "down";
}
```

### 2.1 A delta, never a re-spec

`move` carries **no `NewKeySpec`**. This is the contract's load-bearing property: `remove` + `add`
cannot express a move, because `NewKeySpec = EditableKeyFields` carries no `sk`, `multitap`,
`flick`, `nodeId` or `provenance`. A re-add would therefore discard every sub-key, every geometry
override, and the `nodeId` that key addressing, the decision trail and spec 035's Case B
byte-preservation all key off.

Both appliers **splice the existing node object**. They may not construct a replacement key.
FR-021's "identity, sub-keys, geometry and provenance survive" is thereby a property of the
implementation strategy, not of a field-copy list that could go stale when `TouchKeyIR` grows a
field.

### 2.2 Semantics

Resolution is against **current** state, per `resolveKeyAddress`'s existing contract — never
against the layout the overlay was authored on. Two successive `left` ops compose.

| `direction` | Effect |
|---|---|
| `left` | swap with the key at `keyIndex - 1` in the same row |
| `right` | swap with the key at `keyIndex + 1` in the same row |
| `up` | remove from row *r*, insert into row *r−1* at `min(keyIndex, targetRow.keys.length)` |
| `down` | remove from row *r*, insert into row *r+1* at `min(keyIndex, targetRow.keys.length)` |

- **Horizontal moves are swaps** (both keys stay in the row, row total unchanged).
- **Vertical moves are transfers** — the source row shortens, the target row lengthens, and both
  rows' metrics change. The layer maximum may move, re-proportioning the whole board (accepted;
  ADR 0002).
- **No wrapping.** A `left` on `keyIndex === 0` does not go to the previous row's end.
- **An emptied row stays.** Moving the only key out of a row leaves a zero-key row that still
  renders, still reports `rowTotal: 0`, and is still selectable. It is not pruned.

### 2.3 Rejection

A move that cannot act is **unreachable through the UI** — the affordance is absent at the boundary
(FR-020, FR-003). A rejection can therefore only arise at *replay*, where the addressed key has
since moved or vanished. That is an ordinary orphan, reported through the existing
`KeyEditRejection` path, not an exception. `checkKeyEditRejections` gains no new
`KeyEditRejectionReason`: an out-of-bounds move reports as the same unresolvable-address outcome
every other kind uses.

### 2.4 Interaction with existing machinery

| Consumer | Behaviour for `"move"` |
|---|---|
| `declaredOperationOutput` | `undefined` — joins `rename`/`remove`/`suppress`/`removeSubKey` in the `default` branch |
| Undo (`undoKeyEdit`, `'k'` stack entries) | pops like any other op; the undo affordance names it (FR-040) |
| `scope: "family"` | **not supported for `move`**. Positional parallelism is the property a family holds to; fanning a move across siblings would be a row-layout operation, which stays deferred. A `move` op carrying `scope: "family"` is a programming error, not an author-reachable state |
| `analyzeKeyEditCollateral` | a move changes no output, so it reports no linked-output collateral |
| `findFamilyParallelismBreaks` | already reports `"moved"` as a break kind — a move on one family member is *detected* as a parallelism break even though it cannot be *fanned out*. That asymmetry is deliberate: the author is told their sibling layers drifted |

---

## 3. The widened field set

### 3.1 Validation

| Field | Rule | On violation |
|---|---|---|
| `hint` | free text | — |
| `width` | integer > 0 | reject the edit; the field is author-typed, so this is a form-validity error, not a diagnostic |
| `pad` | integer ≥ 0 | as above |
| `layer` | free text | **never validated as a layer reference** (§3.2) |

### 3.2 Why `layer` is not validated but `nextlayer` is

They carry the same wire property and mean different things. `nextlayer` routes the board and must
name a declared layer, else `TOUCH_KEY_MISSING_LAYER`. `layer` names the modifier state *this one
key* emits under; `TouchKeyIR.layer`'s own doc records that corpus keyboards "apply it
inconsistently and sometimes name a layer that does not exist top-level". Validating it as a
reference would report thousands of shipped keyboards as broken.

`layer` remains load-bearing for the duplicate-id check's third exemption — a layout legitimately
carrying one key id twice within a layer — so editing it can *change* whether
`TOUCH_KEY_DUPLICATE_ID` fires. That is correct and is the reason it must be editable.

### 3.3 `width` is a declared minimum

Because a row can never exceed the layer maximum, the remainder handed to the last key is always at
least its declared width. The field therefore means `min-width` (ADR 0002).

- The panel shows the **declared** value and labels it as a minimum
  (`key-property-panel-width-minimum-note`), never the rendered width (FR-015).
- The renderer computes the last key's size as `widthPct + row.slackPct`.
- Developer's label "Width" is kept for parity; the semantics live in help text, not in a rename.

### 3.4 New keys ignore `width` and `pad`

`add` assigns `DEFAULT_KEY_WIDTH_PCT` (100) and `DEFAULT_KEY_PAD_PCT` (15) regardless of what the
spec carries. The editor never splits an anchor key's width and never normalizes the row (FR-016).
Adding a key **enlarges the layer maximum**, shrinking every key proportionally — so nothing clips
and no width goes negative (FR-017), which is what makes "allow more keys, but complain" safe.

---

## 4. Diagnostics added

Both are non-blocking. Adding a `TouchKeyFindingCode` member obliges a fix descriptor and a
localized copy entry; `findingCopy.ts` is exhaustive over the union via a `never`-checked switch, so
the build enforces it.

### `TOUCH_KEY_ROW_CROWDED`

- Severity `warning`, scope `"layer"`.
- Fires when `interactiveKeyCount > platformMaxKeys`. Interactive count excludes `sp` 9/10 via the
  canonical `isSpacerKeyClass` — so a row of nothing but blanks and spacers never warns.
- Thresholds come from **one shared table** (phone 10, tablet 13, desktop unruled), read by both
  this diagnostic and `packages/keyboard-lint/src/checks/check-18-3-keys-per-row.ts`. The Layer C
  check keeps its code, severity, layer and location; it stops owning the literal.
- Detail is structured: `{ rowIndex, interactiveKeyCount, platformMaxKeys }`. No English prose
  crosses the engine boundary (FR-037).
- Fix: `TrimRowFix { kind: "trimRow", address, rowIndex, overBy }`. Acting on it **selects the row**;
  it deletes nothing, because which key to drop is the author's call.
- Exceeding the maximum is never **prevented** (FR-014).

### `TOUCH_KEY_KEYCAP_MISMATCH`

- Severity `hint`, scope `"key"`.
- Fires only when **all** of: `sp` is 0 (character class — never 1/2/8/9/10); the key has a
  resolvable output; the keycap is non-empty; and `keycapAuthored` is not set; and
  `isKeycapRelated(keycap, output)` is `false` under **every** relatedness test.
- Fix: `SetKeycapFix { kind: "setKeycap", address, proposed }`.
- See [id-and-keycap-proposals.md](id-and-keycap-proposals.md) §3 for the relatedness tests.
