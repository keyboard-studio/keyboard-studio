# Contract: layer families and the property-scoped parallelism check

Normative for FR-063…FR-068 of [spec.md](../spec.md). Rationale in [research.md](../research.md) R3f.

---

## 1. Purpose

An author editing one layer of an 8-layer, 394-key touch layout cannot verify by eye that the layer's siblings — `shift`, `caps`, `rightalt`, `rightalt-shift`, … — stay parallel with it. That is exactly the invariant Cameroon's blank-key method exists to protect (R3a/R3c), and it is the largest untested-by-spec surface this feature has: nothing checks it today, and nothing in the grid UI surfaces a broken family short of clicking through every layer by hand. This contract exists to make that check mechanical rather than aspirational — protecting precisely the layouts too big for a human to audit by inspection.

---

## 2. The decomposition

A layer id decomposes as:

```
[<plane>-]<modifier-combo>
```

Absent plane means the base **alphabetic** plane. `<modifier-combo>` is built from the modifier vocabulary in [modifierCombos.ts](../../../packages/engine/src/pattern-apply/modifierCombos.ts): `SHIFT`, `CAPS`, `NCAPS`, `ALT`/`RALT`/`LALT`, `CTRL`/`RCTRL`/`LCTRL`, joined with `comboToTouchLayerId`'s own precedence order and per-token fragments (`shift`, `caps`, `rightalt`, `rightctrl`, …), CAPS/NCAPS trailing every other fragment.

**`comboToTouchLayerId` is forward-only.** It maps a canonicalized `ModifierToken[]` to a layer id string; there is no inverse. This contract specifies the **new** machinery: a decomposition function that takes a layer id string and recovers `{ plane, tokens }` (or fails to freeform — see §3). Building it means re-deriving, from the id string, which of the known per-token fragments (`shift`, `caps`, `rightalt`, `rightctrl`, `leftctrl`, `leftalt`, `ctrl`, `alt`, `ncaps`) it is composed of, in `TOUCH_LAYER_PRECEDENCE_ORDER`, optionally preceded by a plane fragment that is not itself a modifier fragment (e.g. `symbol`).

Worked examples:

| Layer id | Plane | Combo | Family |
|---|---|---|---|
| `default` | alphabetic | `[]` | alphabetic |
| `shift` | alphabetic | `[SHIFT]` | alphabetic |
| `caps` | alphabetic | `[CAPS]` | alphabetic |
| `rightalt-shift` | alphabetic | `[SHIFT, RALT]` | alphabetic |
| `rightalt-caps` | alphabetic | `[CAPS, RALT]` | alphabetic |
| `symbol` | symbol | `[]` | symbol |
| `symbol-caps` | symbol | `[CAPS]` | symbol |

A **family** is every layer id sharing the same plane. Cameroon's 2×2×2 cross product ({base,shift/caps} × {plain,rightalt} × {alpha,symbol}) is two families: the six alphabetic-plane layers, and the two symbol-plane layers.

---

## 3. The freeform fallback

**A layer id the grammar cannot parse becomes its own freeform plane — never a family member, and never a parallelism finding.** This is FR-067's silence guarantee, and it is deliberate: imported keyboards name layers arbitrarily. `gff_amharic` ships 53 phone layers named after Ethiopic consonants; `fv_southern_carrier` ships 35 syllable-mnemonic layer names. Attempting to force those into the `[<plane>-]<modifier-combo>` grammar would fabricate false families and drive a wave of false *loud* complaints — exactly backwards for a check whose whole reason to exist is a strong signal.

**The coverage consequence is acknowledged, not hidden.** Syllabary/abugida-convention layer-naming layouts get **no parallelism protection** this increment. That is a real gap for exactly the keyboards the feature's own linguistic motivation cites. Extending the grammar per-script (e.g. a recognized Ethiopic- or syllable-mnemonic layer-naming convention) is future work; the freeform fallback's silence is what makes shipping the alphabetic/modifier-combo case safe *without* that work being done first — a loud check with a guessed decomposition would be worse than no check at all.

---

## 4. The property split for frame and layer-switch keys (FR-068)

Parallelism cannot be compared key-wholesale across a family, because some properties of a frame/layer-switch key are *supposed* to differ from layer to layer (R3b, R3f):

| Property | Across a family | Why |
|---|---|---|
| `sp` | **MAY vary** | The active/inactive alternation (`specialActive` on the layer it switches *to*, `special` elsewhere) is correct design, not drift. |
| `nextlayer` | **MAY vary** | From `default` the Shift key goes *to* `shift`; from `shift` it comes *back* — necessarily different targets. |
| `id` | **MAY vary** | Cameroon uses `T_LOWER` on `symbol`, `T_UPPER` on `symbol-caps` — equivalent jobs, different ids at the same position. |
| keycap `text` | **MAY vary** | Same reasoning as `id`: the label reflects the destination, not a fixed identity. |
| **position, width** | **MUST NOT vary** | A frame key that moves or resizes between layers is real drift, independent of everything else that is allowed to change. |

The split is keyed on the key **being** a frame/layer-switch key (has a `nextlayer`, or is otherwise identified as a control key), not on a row index — "the bottom row" is a convention some keyboards follow, not a rule the check can rely on.

**This is the same split [check-18-4](../../../packages/keyboard-lint/src/checks/check-18-4-control-key-drift.ts) needs before its `CONTROL_KEY_IDS` allowlist can be widened past `K_BKSP`/`K_ENTER`.** That check's strict `base.sp !== geometry.sp` comparison would false-fire on every correctly-authored active/inactive `sp` alternation if `CONTROL_KEY_IDS` grew to include a layer-switch key such as `K_SHIFT` — see [research.md](../research.md) R3b's "latent trap, not a present bug" note. This contract's property table is the fix that check would need first.

---

## 5. Severity

- **Alphabetic-family break: loud.** A position or width mismatch within the alphabetic-plane family is exactly the invariant the author's blank-key method protects; report it as a blocking/prominent finding, not a quiet hint.
- **Within-plane modifier-family break (e.g. `symbol` vs `symbol-caps`): softer.** Still a finding, but non-alphabetic planes carry less muscle-memory weight (R3c) — a warning, not a hard stop.
- **Cross-plane: never compared.** The alphabetic and symbol planes are not siblings; comparing a `default` key's position against a `symbol` key's position at the "same" row/column is not a parallelism question this check asks.

---

## 6. Test obligations

- **Decomposition unit tests over real corpus layer-id strings.** Cover the standard combo vocabulary (`default`, `shift`, `caps`, `rightalt`, `rightalt-shift`, `rightalt-caps`, `symbol`, `symbol-caps`, and a chiral-ctrl combo). Confirm every one of `gff_amharic`'s Ethiopic-named layers, and every one of `fv_southern_carrier`'s syllable-mnemonic layers, falls to freeform — none may be misparsed into a spurious family.
- **Freeform-silence guarantee.** An all-freeform layout (every layer id unparseable — the `gff_amharic`/`fv_southern_carrier` shape) produces **zero** parallelism findings, confirmed as its own regression lock so a future grammar extension cannot silently start generating noise on those corpus keyboards without a deliberate decision.
- **Property-scoped exemption tests.** A Shift key differing in `sp`, `nextlayer`, `id`, or keycap text across its family → no finding. The same key moved or resized across the family → a finding, at the severity in §5.
- **Family-wide-apply enumeration (FR-065).** Removing or suppressing a key across its family shows per-layer content in the confirmation surface — the same position may hold a different character on `shift` than on `default`, and the enumeration must reflect that per layer, not assume identical content.
