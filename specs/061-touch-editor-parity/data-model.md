# Data Model: Touch key editor — Developer-parity remodel

**Feature**: 061-touch-editor-parity · **Phase 1**

Every entity below is either an **extension** of a type spec 058 already shipped or a **new**
derived shape. Nothing here renames or removes an existing field, and nothing here touches
`Pattern` / `Criterion` (Constitution Article I — see [plan.md](plan.md)'s Constitution Check).

Legend: **+** added · **~** semantics changed, shape unchanged · **NEW** wholly new.

---

## 1. `EditableKeyFields` — **+** four fields

`packages/engine/src/pattern-apply/keyEditOps.ts`

| Field | Type | State | Validation |
|---|---|---|---|
| `id` | `string` | existing | `checkKeyIdSyntax` + `checkReservedKeyId` (unchanged) |
| `text` | `string` | existing | free text; a `*…*` frame label on a non-frame key fires `TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL` |
| `output` | `string?` | existing | — |
| `sp` | `EditableKeySp` | existing | `0 \| 1 \| 2 \| 8 \| 9 \| 10` |
| `nextlayer` | `string?` | existing | must name a declared layer of the platform, else `TOUCH_KEY_MISSING_LAYER` |
| `hint` | `string?` | **+** | free text. Convention only — a hint with no `sk[]` is not an error |
| `width` | `number?` | **+** | integer > 0, 100-unit model. **Declared minimum**, not rendered size (§4) |
| `pad` | `number?` | **+** | integer ≥ 0, 100-unit model |
| `layer` | `string?` | **+** | per-key modifier override. Free-text by wire format; **not** validated as a layer reference (see `TouchKeyIR.layer`'s own doc — corpus keyboards name non-existent layers) |

**Why `layer` is not validated like `nextlayer`**: they are different things carried by the same
wire property. `nextlayer` routes the board and must resolve; `layer` names the modifier state
*this one key* emits under and is applied inconsistently across the corpus. Validating it would
report thousands of shipped keyboards as broken.

**Deliberately still excluded**: `nodeId` (identity, never authored), `provenance` (auto-managed),
`default` (sub-key-only preselect), `sk`/`multitap`/`flick` (structural — edited by
`setSubKey`/`removeSubKey`, not as fields), `layerAnnotation` (the read-only twin of `layer`).

`NewKeySpec = EditableKeyFields` still holds, but a **new key ignores `width`/`pad`** — FR-016
assigns the standard default (`DEFAULT_KEY_WIDTH_PCT` = 100, `DEFAULT_KEY_PAD_PCT` = 15) and
never splits an anchor key's width.

---

## 2. `MoveKeyOp` — **NEW** operation kind

```ts
export interface MoveKeyOp extends KeyEditOperationBase {
  readonly kind: "move";
  readonly direction: "left" | "right" | "up" | "down";
}
```

Admitted to `KeyEditOperation`, making it eight kinds. Carries **no key spec** — that is the whole
point (see [research.md](research.md) D4): the applier splices the *existing* node, so `nodeId`,
`provenance`, `sk`, `multitap`, `flick`, `width` and `pad` all survive untouched (FR-021).

**Semantics**

| Direction | Effect | Refused (no-op + rejection) when |
|---|---|---|
| `left` | swap with the preceding key in the same row | key is `keyIndex === 0` |
| `right` | swap with the following key in the same row | key is the last in its row |
| `up` | move to the preceding row, at the same `keyIndex` clamped to that row's length | key is in row 0 |
| `down` | move to the following row, same clamping | key is in the last row |

- **No wrapping** across row boundaries (FR-020). A refused move is not an error the author can
  reach — the panel's affordance is *absent* at the boundary (FR-003), so a rejection can only
  arise from replay against changed state, where it is reported as an ordinary orphan.
- `up`/`down` are **moves**, not swaps — the key leaves its row, so the source row shortens and
  the target row lengthens. Both rows' metrics change and the layer maximum may move.
- Moving the only key out of a row **leaves that row empty** (an accepted edge case). An empty row
  contributes `rowTotal: 0` and is still rendered and still selectable.
- `declaredOperationOutput(op)` returns `undefined` for `"move"` — it authors no output, joining
  `rename`/`remove`/`suppress`/`removeSubKey` in that function's `default` branch.

**Replay identity**: like every other op, `move` resolves its `address` against **current** state,
never against the layout it was authored on (`resolveKeyAddress`'s existing contract). Two
successive `left` moves therefore compose correctly.

---

## 3. `KeyGridRowMetrics` — **NEW** derived shape

`packages/studio/src/editors/assignLoop/keyGrid/keyGridViewModel.ts`, computed by a shared
engine helper (`rowMetrics.ts`) so Layer C and the editor cannot disagree.

```ts
export interface KeyGridRowMetrics {
  readonly interactiveKeyCount: number;   // !isSpacerKeyClass(sp) — excludes sp 9/10
  readonly keyWidthTotal: number;         // sum of DECLARED widthPct
  readonly padTotal: number;              // sum of padPct
  readonly rowTotal: number;              // keyWidthTotal + padTotal
  readonly platformMaxKeys?: number;      // 10 phone / 13 tablet; absent for desktop
  readonly overMaximumBy?: number;        // interactiveKeyCount - platformMaxKeys, when > 0
}
```

Attached to `KeyGridRowViewModel` beside the retained `slackPct`. Reads the **declared** widths, so
`rowTotal` is what the author authored — the stretch is a render-time consequence, never folded
back into the numbers (FR-013, FR-015).

`platformMaxKeys` absent means "this platform has no rule" — desktop. `overMaximumBy` present is
exactly the trigger for `TOUCH_KEY_ROW_CROWDED`.

## 4. `KeyGridRowViewModel` / `KeyGridCellViewModel` — **~** semantics

| Field | Change |
|---|---|
| `KeyGridRowViewModel.slackPct` | **~** retained; **stops being a rendering input**, becomes the metrics/crowding input and the last key's stretch amount (ADR 0002) |
| `KeyGridRowViewModel.metrics` | **+** `KeyGridRowMetrics` |
| `KeyGridCellViewModel.widthPct` | **~** unchanged value; now understood as a **declared minimum**. The renderer computes `isLastInRow ? widthPct + row.slackPct : widthPct`; the panel shows `widthPct` alone |
| `KeyGridCellViewModel.isLastInRow` | **+** `boolean` — so the renderer and the panel's "minimum" labelling read one fact rather than each re-deriving an index comparison |

`KeyGridViewModel` itself is unchanged in shape.

---

## 5. Diagnostics — **+** two codes

`packages/contracts/src/touch-key-diagnostics.ts`. Each addition obliges a fix descriptor and a
localized copy entry; `findingCopy.ts`'s `never`-checked switch makes the build enforce it.

### `TOUCH_KEY_ROW_CROWDED`

| Property | Value |
|---|---|
| Severity | `warning` — **non-blocking**; the edit succeeds (FR-014) |
| Scope | `"layer"` — the subject is a row, so it renders in the grid's layer-level strip / the row readout, not on a cell |
| Address | `touchKeyAddress(platform, layerId, <first key id of the row>)`, plus `rowIndex` in the detail |
| Detail | `{ rowIndex, interactiveKeyCount, platformMaxKeys }` — structured, never prose (FR-037) |
| Fix | `TrimRowFix { kind: "trimRow", address, rowIndex, overBy }` — a descriptor naming the row and the overage; acting on it selects the row rather than deleting anything, since *which* key to remove is the author's call |
| Fires when | `interactiveKeyCount > platformMaxKeys`, thresholds from the one shared table (phone 10, tablet 13, desktop unruled) |
| Never fires when | the platform has no rule; or the row's keys are all blank/spacer (`isSpacerKeyClass`), which the interactive count already excludes |

### `TOUCH_KEY_KEYCAP_MISMATCH`

| Property | Value |
|---|---|
| Severity | `hint` — **never blocking** (FR-036) |
| Scope | `"key"` |
| Fires when | **all** of: the key is character-class (`sp` 0 — not 1/2/8/9/10); it has a resolvable output; the keycap is non-empty; and `isKeycapRelated(keycap, output)` is `false` under **every** relatedness test |
| Fix | `SetKeycapFix { kind: "setKeycap", address, proposed }` — `proposed` from `proposeKeycap(output)` |
| Suppressed permanently by | `keycapAuthored` (§6) — a hand-edited keycap is never second-guessed and never rewritten (FR-035) |

**Relatedness tests (all five must fail before the hint fires)** — `keycapRelatedness.ts`:

1. **Identity** after NFC.
2. **Case variants** — `toLocaleUpperCase`/`toLocaleLowerCase` under the keyboard's BCP47.
3. **Normalization variants** — NFC/NFD equality, plus **NFKD** equality, which is the one place
   compatibility decomposition is used (this is what makes `1` ↔ `١` related, SC-008).
4. **Dotted-circle carrier** — strip `U+25CC` from the keycap and retest.
5. **Spacing-accent stand-in** — a spacing clone (`` ` `` U+0060, `´` U+00B4, `^`, `~`, `¨`) whose
   NFKD-decomposed combining form matches the output's combining mark.

---

## 6. Keycap provenance — **+** one flag

FR-035 requires "once the author edits a keycap by hand, later output changes must not rewrite
it". That is a fact about a key, and nothing today records it.

```ts
// TouchKeyIR
/** True once the author has typed this keycap themselves. Proposals never overwrite it. */
keycapAuthored?: boolean;
```

- Additive and optional: an absent flag means "proposal-managed", which is the correct reading for
  every existing corpus key and every key spec 058 already wrote.
- Set by the property panel's keycap field on author edit; **never** by a proposal.
- Read by `proposeKeycap`'s caller (to skip) and by the mismatch detector (to suppress).
- Round-trips like `provenance` does: it is studio state on the IR, not a `.keyman-touch-layout`
  wire property, so the emitter does not write it. It therefore does **not** survive
  export→reimport, which is correct — a reimported keyboard has no record of who typed what.

## 7. Id proposal — **+** one path, **NEW** wrapper

`KeyIdMintingPath` gains `"inherited"`. New `proposeTouchKeyId`:

```ts
export interface TouchKeyIdProposalRequest {
  readonly chars: string;
  readonly inheritedId?: string;              // the physical key's id at this position
  readonly ruleIndex: TouchKeyRuleIndex;      // to ask what inheritedId actually produces
  readonly expectedOutputs: readonly string[]; // default + modifier outputs the key must yield
  readonly capsHandled: boolean;
  readonly bcp47?: string;
  readonly caseTripleRequested?: boolean;
  readonly sharedCandidateCount?: number;
}

export interface TouchKeyIdProposal extends KeyIdMintingProposal {
  /** "inherited" adds to the four existing minting paths. */
  readonly path: KeyIdMintingPath;
  /** Present on every path: why this proposal, structured for the studio to localize. */
  readonly because: TouchKeyIdProposalReason;
  /** Present ONLY when no path could produce a proposal — FR-032's "state why". */
  readonly noProposalReason?: NoProposalReason;
}

export type NoProposalReason =
  | { kind: "titlecase-self-third-form" }     // Ǆ Ǉ Ǌ — reuses NoCaseTripleReason's finding
  | { kind: "unassigned-codepoint" }
  | { kind: "variation-selector-only" }
  | { kind: "emoji-sequence-unsupported" }
  | { kind: "empty-output" };
```

**Order of attempt** (FR-029 → FR-030 → FR-031):

1. **Inherit** — `inheritedId` is present *and* `producedByKeyId(ruleIndex, inheritedId)` covers
   every entry of `expectedOutputs`. → `path: "inherited"`, `ruleRequired: false`. **No rule is
   written** (FR-029 verbatim).
2. **Ask whether any physical key already produces the character** (FR-030) — the same
   `producedByKeyId` query across the layout's physical ids. Never geometric proximity; there is
   no coordinate in this request shape, which is what makes that guarantee structural.
3. **Delegate to `proposeKeyId`** for the four existing rows (unicode default; combining-mark
   guard; multi-codepoint string; case triple).
4. **No path** → `noProposalReason`, and the panel says why (FR-032). A dotted-circle keycap
   carrying no character credits nothing and lands here as `empty-output`.

`ruleRequired` / `guardRequired` / `ruleLines` / `caseTriple` / `noCaseTripleReason` /
`alternative` are inherited from `KeyIdMintingProposal` unchanged.

---

## 8. Layer selector model — **NEW** derived shape

```ts
export interface LayerSelectorGroup {
  readonly plane: string | undefined;         // from decomposeLayerId
  readonly planeClass: PlaneClass;            // "alphabetic" | "distinct" | "unrecognized"
  readonly families: readonly LayerSelectorFamily[];
}

export interface LayerSelectorFamily {
  readonly members: readonly LayerSelectorEntry[];
}

export interface LayerSelectorEntry {
  readonly layerId: string;
  readonly findingCounts: { readonly error: number; readonly warning: number; readonly hint: number };
}
```

- Source of layer ids: **the platform's declared `layers[]`**, never any key's `nextlayer`. This is
  what makes FR-004's "including layers no key's next-layer reaches" true by construction.
- Grouping: `groupLayerFamilies(layerIds)` + `classifyPlane(plane)`, both already exported from the
  engine index. Not re-derived (FR-005, research D11).
- `findingCounts` roll up the **already-computed** diagnostics map by the layer segment of each
  finding's address — no second validation pass, so decision D3 / Article IV holds (FR-039).
- A platform with exactly one layer renders the selector as a **label, not a control** — it must
  not imply choices that do not exist (spec Edge Cases).

## 9. State ownership — what does *not* change

| Concern | Owner | Change |
|---|---|---|
| Committed edits | `workingCopyStore.keyEditOverlay.ops` | none — `move` is just an eighth kind |
| Undo | the shared chronological stack (`'k'` entries) + `undoKeyEdit` | none; `move` is undoable and names itself (FR-040) |
| Active platform | `TouchGallery` `useState` `activeKeyPlatformId` | none — already wired |
| Active layer | `TouchGallery` `useState` `activeKeyLayerId` | **gains a control** (the selector) and a `nextlayer`-follow setter (FR-006). Still one piece of state, still with its repair effect |
| Mode (character / key) | `workingCopyStore.touchEditorMode` | none — still a view swap, not a fork (FR-025) |
| Diagnostics | `useTouchKeyDiagnostics` (`useMemo`) | two more codes inside the same cycle |

No new store field, no new timer, no second working copy.
