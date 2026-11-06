# FR-007 verification: touch `ctrl` / `shift-ctrl` layers in basic_* keyboards

Read-only evidence for the owner. Sources: `../keyboards/release/basic/basic_kbd*/source/*.keyman-touch-layout` and `*.kmn`; KeymanWeb source in the local checkout `C:/Github/keyman` (HEAD ef5991f6b5, 2026-08-26). Nothing was executed in a browser; the "touch output" columns come from reading code, not from running KeymanWeb.

## Finding 1: which keyboards

Exactly 14 basic_* keyboards define a tablet `ctrl` or `shift-ctrl` layer: a1, a2, a3, azel, br, cr, div1, div2, fa, geo, inmal (`shift-ctrl`), intam (`shift-ctrl`), sf, th0. None of them has a `rightalt` layer today. basic_kbdsp has no `ctrl` layer (layers: default, shift, rightalt, caps, symbol, symbol-caps) but its three `K_LCONTROL` keys carry `nextlayer: ctrl`, which points at a layer that does not exist.

## Finding 2: does KeymanWeb derive a touch key's modifiers from its layer id? Yes (verified in source)

- `web/src/engine/src/keyboard/codes.ts`, `getModifierState(layerId)`: substring match on the layer id. `shift` gives SHIFT; `leftctrl`/`rightctrl` give chiral LCTRL/RCTRL; bare `ctrl` (with no chiral match) gives non-chiral CTRL; `leftalt`/`rightalt` give LALT/RALT; bare `alt` gives ALT.
- `web/src/engine/src/keyboard/keyboards/activeLayout.ts` (~line 382): each touch key gets `Lmodifiers: Codes.getModifierState(layer)`, with `Lcode` from the key id (K_*).
- `web/src/engine/src/js-processor/jsKeyboardProcessor.ts` (~line 516): the processor's modifier state is `getModifierState(this.layerId) | Lstates`. A `nextlayer` naming a missing layer falls back to `default` (~line 511).
- `web/src/engine/src/js-processor/jsKeyboardInterface.ts` `keyMatch`/`matchModifiersToRuleChirality` (~534-598): a virtual-key rule matches only if its modifier mask equals the event's. The function only collapses event chirality when the rule is non-chiral; a `[RALT ...]` rule is never matched by a non-chiral CTRL event.
- `U_xxxx` keys are different: the id is converted to its text and output directly (`activeLayout.ts` ~265-271), so layer-derived modifiers do not change their output.

## Finding 3: per-keyboard table

"Kmn rules" = modifier forms used in the keyboard's .kmn. "Touch keys" = visible content keys on the layer. Output under the current id: for K_ keys, the layer gives CTRL (or SHIFT+CTRL), which matches no AltGr rule. Under `rightalt` (or `rightalt-shift`), the layer gives RALT (or SHIFT+RALT), which does match the kmn `[RALT ...]` / `[SHIFT RALT ...]` rules. Default output rules for an unmatched ctrl-modified key are not traced here (defaultOutputRules.ts ~137 suggests none), so "no match" is the only claim.

| Keyboard | Layer id | Real content | Kmn rules | Touch keys | Output under current id | Output under `rightalt` |
|---|---|---|---|---|---|---|
| basic_kbda1 | ctrl | Genuine Ctrl (Shift+Ctrl): ZWJ, ZWNJ, LRM, RLM | 4x `[SHIFT CTRL K_1..4]` | U_200D, U_200C, U_200E, U_200F (direct) | Correct text (U_ keys ignore modifiers) | Same text; but the id would then mean AltGr, a wrong label for genuine Ctrl content |
| basic_kbdfa | ctrl | Genuine Ctrl (Shift+Ctrl) controls, plus K_0 | 4x `[SHIFT CTRL K_1..4]`, 1x `[CTRL ...]` | 4 U_ controls; K_0 (ہ) | U_ keys correct; K_0 matches only if its rule is the `CTRL` one (not checked) | U_ keys same; K_0 would stop matching a CTRL rule |
| basic_kbdth0 | ctrl | LCTRL (left Ctrl only): % ๑ + ๒ | 4x `[LCTRL ...]` | U_0025, U_0E51, U_002B, U_0E52 (direct) | Correct text (direct); a K_ key would not match LCTRL since the layer is non-chiral CTRL | Same text |
| basic_kbda2 | ctrl | AltGr (+ZWJ/ZWNJ/LRM/RLM direct) | 7x `[RALT ...]` | 4 U_ plus K_4, K_Q, K_W, K_E, K_R, K_C, K_V (Arabic harakat) | U_ correct; the 7 K_ keys match nothing (rules are RALT) | All keys correct |
| basic_kbda3 | ctrl | AltGr (same shape as a2) | 7x `[RALT ...]` | same as a2 | U_ correct; K_ keys match nothing | All correct |
| basic_kbdazel | ctrl | AltGr (@, ₼) | 2x `[RALT ...]` | K_2, K_4, K_LCONTROL, K_SYMBOLS | K_2/K_4 match nothing | Correct |
| basic_kbdbr | ctrl | AltGr (superscripts, £ ¢ ¬ § / ? ° ª º ₢) | 14x `[RALT ...]` | 13 K_ content keys | none match | Correct |
| basic_kbdcr | ctrl | AltGr (~ ` \ \| € ÷ × [ ] ł Ł ß ¤ @ { } § < >) | 29x `[RALT ...]` | 19 U_ content keys (direct) | Correct text (direct) | Same text |
| basic_kbddiv1 | ctrl | AltGr (; , ZWJ ZWNJ LRM RLM) | 6x `[RALT ...]` | K_COLON, K_V, K_B, K_N, K_M, K_COMMA | none match | Correct |
| basic_kbddiv2 | ctrl | AltGr | 6x `[RALT ...]` | K_F, K_QUOTE, K_V, K_B, K_N, K_M | none match | Correct |
| basic_kbdgeo | ctrl | AltGr (Georgian archaic letters) | 6x `[RALT ...]` | K_T, K_LBRKT, K_A, K_D, K_N, K_SLASH | none match | Correct |
| basic_kbdsf | ctrl | AltGr (¦ @ # ° § ¬ \| ¢ € [ ] { } \) | 16x `[RALT ...]` | K_1..K_8, K_E, K_LBRKT, K_RBRKT, K_QUOTE, K_BKSLASH; U_005C | K_ keys match nothing; U_005C correct | All correct |
| basic_kbdinmal | shift-ctrl | AltGr / Shift+AltGr (Malayalam digits, fractions) | 11x `[RALT ...]` plus `[SHIFT RALT ...]` | K_1..K_0 digits, K_EQUAL, K_Q, K_R, second K_1/K_2/K_3 (fractions), K_D, K_V; U_20B9, ZWJ, ZWNJ | K_ keys match nothing (layer is SHIFT+CTRL) | Needs `rightalt-shift`; the layer mixes RALT and SHIFT RALT content, so one id may not express both (not resolved here) |
| basic_kbdintam | shift-ctrl | AltGr / Shift+AltGr (Tamil digits, symbols) | 20x `[RALT ...]` (some may be SHIFT RALT) | K_1..K_0, K_HYPHEN, K_EQUAL, K_Y, K_H, K_Z, K_X, K_C, K_V, K_B, K_N; U_20B9 | K_ keys match nothing | As inmal: `rightalt-shift` for the shifted ones |
| basic_kbdsp | none (refs only) | Nothing: three `K_LCONTROL` keys point `nextlayer: ctrl` at a missing layer | 7+ `[RALT ...]`; has a `rightalt` layer | n/a | Pressing the Ctrl key falls back to `default` | n/a; the right fix is to repoint to `rightalt` or drop the key |

## Summary for the owner

- Genuine Ctrl: a1, fa (Shift+Ctrl direct-text controls). LCTRL: th0. All three use `U_` direct keys, so their touch output does not depend on the layer id; renaming would change meaning only.
- AltGr mislabelled as `ctrl`: the other 9 plus inmal/intam as `shift-ctrl`. Where those layers use `K_` keys (a2, a3, azel, br, div1, div2, geo, sf, inmal, intam), the current id makes KeymanWeb send CTRL, which matches none of the kmn `[RALT ...]` rules, so those touch keys produce no rule output. Renaming to `rightalt` (and `rightalt-shift` for the shifted layers) is what makes the modifiers line up. cr and the U_ keys elsewhere are unaffected either way.
- Not verified: actual runtime output in a browser (the touch-layout compiler and kmcmplib may also treat `ctrl` specially); which kmn rules (RALT vs SHIFT RALT) pair with each individual inmal/intam key; fa's one `[CTRL ...]` rule's key. A KeymanWeb run on a2 (touch emulation, press K_Q on the `ctrl` layer) would settle the "no output" claim.
