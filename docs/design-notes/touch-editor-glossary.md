# Touch editor — glossary

The vocabulary of the key-level touch editor, settled during the issue #1530 design
review. This is a glossary, not a spec: it fixes what each word *means* so that the
follow-up spec, the code, and the UI copy can all use them the same way.

Governing specs: [spec.md](../../spec.md) §8, §14 Decision 6,
[specs/063-touch-key-editor](../../specs/063-touch-key-editor/spec.md).

---

## The surfaces

**Desktop layout** — the physical keyboard, locked before the touch stage is entered.
Its key *count* is fixed. Touch is derived from it and never derives back (Decision 6).

**Touch layout** — the `.keyman-touch-layout` structure. It has its own geometry, its
own key count, and its own rows. It is **not** a rendering of the desktop layout, and
the editor must never size it as though it were.

**Platform** — `phone`, `tablet`, or `desktop` within a touch layout. Each carries its
own independent set of layers. A keyboard may define one, two, or all three.

**Layer** — one addressable board of keys within a platform (`default`, `shift`,
`numeric`, …). Layer ids are auto-derived, never author-typed
([specs/008-data-flow](../../specs/008-data-flow/spec.md)).

**Layer family** — a group of layers that are modifier variants of one another
(`default` / `shift` / `caps` / `caps-shift` / `rightalt` …). Members are expected to
stay *parallel*: a key's position and width must match across the family, though its
id, keycap, type, and next-layer may legitimately differ on frame keys.

**Plane** — the broader class a layer belongs to. *Alphabetic* planes are held to
family parallelism; *distinct* planes (symbol, currency, emoji) are freeform and are
never nagged for it.

**Character mode / key mode** — the two views of the touch stage. Character mode walks
the inventory asking "where should this character live?"; key mode presents the layout
as an editable board. A **view toggle, not a fork** — switching is lossless in both
directions and neither view's progress is discarded.

## The key

**Keycap** — the glyph the user sees on the key. Distinct from what the key produces.

**Key id** — the key's identity and the thing rules are written against (`K_Q`,
`U_0300`, `T_0300`). Editing the id is the core operation this editor exists for.

**Unicode key** — a `U_<HEX>` id. Keyman derives the output from the id itself, so it
needs no rule and **cannot go dead**. The default choice for a plain single-codepoint
output.

**Custom key** — a `T_*` id. It has **no intrinsic output**: it produces a character
only if the `.kmn` carries a rule keyed on it. The hex in `T_0300` is a *human*
cross-check convention — it is never machine-interpreted, and a `T_<HEX>` id is exactly
as inert as a `T_<MNEMONIC>` one. A custom key with no rule behind it is a **dead key**
— a defect, not a style.

A custom key is the right choice only where a Unicode key cannot do the job: a
**combining mark** (which self-outputs before any guard rule can protect it), a
**multi-codepoint string**, or a **case triple**. Reaching for `T_` outside those cases
is how a keyboard accumulates dead keys.

**Inherited key** — a touch key that kept the `K_*` id it derived from the physical
layout. Costs no rules at all, and carries the physical key's whole modifier behaviour
across the layer family for free. The right answer whenever the touch key's default and
modifier outputs still match the physical key's.

**Auto id** — the id the editor proposes without being asked: *inherited* where the
physical key's outputs still match, *Unicode* for a plain new output, *custom* only for
the three cases a Unicode key cannot express.

A hand-typed id is meant to be the rare exception. That rarity is an **outcome the rules
earn**, not an assumption the design may lean on: every character class the author can
reach should have a path, and each hand-typed id is evidence of a class that doesn't.

**Key type** — the `sp` value. An authoring control, not an implementation detail:
*character*, *frame (inactive)*, *frame (active)*, *deadkey-styled*, *blank*, *spacer*.
Type governs **rendering and interactivity**; the id governs **output**. Both halves
are needed to make a key genuinely inert.

**Hint** — secondary text shown on the keycap, distinct from the keycap itself.

**Next layer** — the layer this key switches the *display* to when pressed.

**Modifier override** — the per-key `layer` field. It overrides the modifier state of
the emitted key event. Distinct from *next layer*, and commonly used to let two keys
share an id within one layer.

**Sub-key** — a secondary entry hanging off a main key. Three kinds:
*longpress* alternates, *multitap* sequences, and *flicks* (eight compass directions).

## Geometry

The touch layout uses a 100-unit virtual grid. Default key width is 100; default pad
is 15.

**Declared width** — the number stored on the key and shown in the property panel.

**Rendered width** — the width the key actually occupies on screen.

**Row total** — the sum of declared width + pad across a row's keys.

**Layer max** — the largest row total in the layer. Every key's rendered width is its
share of the layer max, so the layer max sets the scale for the whole board.

**Stretch** — the last key in every row renders at *whatever remains* of the layer max,
ignoring its own declared width for its own rendering. This is KeymanWeb's behaviour
and the editor reproduces it.

> **This replaced the hatch.** [specs/063-touch-key-editor](../../specs/063-touch-key-editor/spec.md)
> FR-039 drew row slack as a visible hatch rather than absorbing it — the reasoning being
> that slack should be *seen*. In practice it made every short row look broken, and it
> disagreed with what the keyboard actually does on a phone. Spec 065 **withdraws that
> FR-039**: slack is absorbed by the stretch and reported as numbers in the row's metrics
> readout instead, so the board reads like the keyboard while the measurements stay
> available. The why is [ADR 0002](../adr/0002-touch-grid-renders-the-last-key-stretched.md);
> [specs/065-touch-editor-parity](../../specs/065-touch-editor-parity/spec.md) is the
> authoritative execution.

**Declared width is therefore a floor, not a size** — a `min-width`, in CSS terms. A
row can never exceed the layer max by definition, so the remainder handed to the last
key is always at least its declared width. Developer labels this field "Width"; its
semantics are min-width, and the editor should say so.

**Slack** — the gap between a row's total and the layer max. Slack is not drawn; it is
absorbed by the stretch and reported as numbers in the row's metrics readout.

**Crowding** — too many interactive keys in a row (over 10 on phone, 13 on tablet).
Permitted, but complained about. Adding keys never clips or breaks a layout — it only
enlarges the layer max, shrinking every key proportionally.

## Editing outcomes

**Delete** — remove the key. Reflows the row and changes its geometry.

**Suppress** — make a key non-interactive *in place*, by setting a non-interactive type
**and** neutralizing its id to a ruleless sentinel, in one operation. Preserves the
row's geometry so the remaining keys stay in their expected positions across layers.

Delete and suppress serve **opposed goals** — touchable area versus cross-layer
predictability. Neither is universally correct; the editor proposes from the layer's
kind and lets the author choose.

**Move** — relocate a key within its row or into an adjacent row, preserving the key's
identity and everything hanging off it. Distinct from delete-then-re-add, which would
discard its sub-keys and geometry and mint a new identity. Moving keys between rows is
the primary way an author balances row widths.

## Correctness

**Key-id ↔ rule join** — matching a layout key against the `.kmn` rules keyed on its
id. Without it the studio both over-credits (a rule whose key exists nowhere) and
under-credits (a `T_*` key whose rule it cannot see) what a keyboard can type.

**Dead key** — a layout key with no rule behind it. **Orphan rule** — a rule whose key
is on no reachable layer. Both are defects the join exists to surface.
