---
status: accepted
date: 2026-08-06
---

# The touch key grid renders row slack the way KeymanWeb does — by stretching the last key

> **This decision reverses part of a shipped one.** [specs/063-touch-key-editor](../../specs/063-touch-key-editor/spec.md)
> FR-039 chose to draw row slack as a hatch rather than absorb it. This ADR records why
> the follow-up (issue #1530) takes the opposite path, and what replaces the hatch. The
> follow-up spec is the authoritative execution; this records the *why*.

## Context

A touch layout uses a 100-unit virtual grid. Each row has a total (declared width + pad
across its keys) and the layer's scale is the **largest** row total. Rows shorter than
that maximum have *slack*.

KeymanWeb resolves slack by ignoring the last key's declared width and giving it
whatever remains of the row
([activeLayout.ts:642](../../packages/engine/src/simulator/vendor/keyman/engine/keyboard/keyboards/activeLayout.ts#L642)):

```js
const keyPercent = 1 - (totalPercent + padPercent + rightMargin);
```

Spec 063 judged that absorption to be information loss for an *editor*: an author who
cannot see slack cannot reclaim it. FR-039 therefore rendered the remainder as a
decorative diagonal hatch, and added per-row "Fill row" and "Even out row" actions to
act on it.

Two things were then learned in use:

1. **The editor no longer looked like the keyboard.** Issue #1530's first complaint is
   that the surface does not read as a keyboard at all. A board whose short rows end in
   striped gaps is a schematic; the device shows a board whose short rows end in a wide
   key.
2. **Neither row action could ever work.** `width`/`pad` are absent from
   `EditableKeyFields`, and no operation in the union authors a width directly, so both
   buttons rendered and did nothing. `KeyGrid.tsx` documented this in its own module
   comment. They read to the author as evidence that nothing on the surface was editable.

## Decision

**The grid renders the last key in each row stretched to the layer maximum, exactly as
KeymanWeb does.** The hatch is removed. "Fill row" and "Even out row" are removed.

Slack does not stop being visible — it stops being drawn as *texture* and becomes
**numbers**, via a per-row metrics readout (`11 keys · 1150 width · 165 pad · 1315
total`), which is what Keyman Developer does and what spec 063's own research listed as
a thing to adopt. The readout is also where the crowding complaint belongs
(`KM_WARN_TOUCH_KEYS_PER_ROW`: over 10 keys on phone, 13 on tablet).

Two consequences follow and are accepted deliberately:

- **A key's declared width is a floor, not a size.** Because a row can never exceed the
  layer maximum, the remainder handed to the last key is always at least its declared
  width. The field means `min-width`. Developer's label ("Width") is kept for parity and
  the semantics are stated in the field's help text rather than by renaming it.
- **The stretch is itself the loudest diagnostic.** A row with two fewer keys than its
  neighbour ends in a visibly enormous key. That is what the author's device will show
  them, and it is more legible than a neutral texture.

## Considered options

- **Keep the hatch, and give the two row actions real handlers** (admitting a row-level
  width operation). Rejected: row operations are deferred to Increment 3 for reasons
  that still hold, and "Even out row" is actively destructive on any row containing a
  spacebar or modifier keys — the two places where a deliberately non-uniform width is
  correct.
- **Keep the hatch, drop the buttons.** Rejected: it preserves the mismatch between the
  editor and the device, which is the complaint that started this.
- **Stretch, and show nothing else.** Rejected: the author would have no way to read
  *how much* slack a row carries or whether a row is over the platform key maximum. The
  metrics readout is what makes stretching safe to adopt.
- **Normalize rows on every edit** so slack cannot exist. Rejected: it contradicts
  FR-022's promise that widths are never silently redistributed, and it cannot express
  a wide spacebar.

## Consequences

- FR-039's hatch and both row actions are withdrawn; the follow-up spec must say so
  explicitly rather than leaving two specs disagreeing.
- `slackPct` stays in the key-grid view model. It stops being a rendering input and
  becomes the input to the metrics readout and the crowding check.
- Adding a key can no longer break a layout — it enlarges the layer maximum, shrinking
  every key proportionally. Nothing clips and no width goes negative. This is what makes
  "allow more keys, but complain" safe.
- Adding a key to the *longest* row visibly re-proportions every other row at once, since
  every other row's last key grows. This is correct (it is what the device does) but it
  is a surprising edit-time effect, and the metrics readout is how the author sees why.
