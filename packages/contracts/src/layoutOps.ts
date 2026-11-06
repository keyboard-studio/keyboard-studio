// Layout-tab edit operations (spec 113, contracts/layout-ops.md).
//
// One confirmed Layout-tab edit is one `LayoutOperation`, recorded as an entry
// in the bundled `kmn-edits` decision (./kmnEdits) and replayed by the
// engine's `replayKmnEdits`. Additive; the locked `Pattern` schema is untouched.

/**
 * A Keyman modifier token as it appears inside a vkey bracket (`[SHIFT K_A]`).
 * Moved here from engine `pattern-apply/modifierCombos.ts` (which re-exports
 * it) because `LayerCombo` is persisted in `kmn-edits` and contracts is the
 * dependency root.
 */
export type ModifierToken =
  | "SHIFT"
  | "CAPS"
  | "NCAPS"
  | "ALT"
  | "RALT"
  | "LALT"
  | "CTRL"
  | "RCTRL"
  | "LCTRL";

/** A desktop layer: a modifier combination, e.g. `[]`, `["SHIFT"]`, `["SHIFT", "RALT"]`. */
export type LayerCombo = readonly ModifierToken[];

/**
 * What a key or row produces: literal text, a deadkey, or nothing.
 *
 * `deadkeyId` is the inner token of the emitted `dk(...)` (research R2, T003):
 * a numeric id as four-digit lowercase hex (`"0001"`, `"3001"`), a named id
 * verbatim (`"acute"`). A name is never all-hex, so the two forms cannot
 * collide. Compare numeric ids by `parseInt(s, 16)`, names by `deadkeyNameKey`.
 */
export type LayoutOutput =
  | { kind: "text"; text: string }
  | { kind: "deadkey"; deadkeyId: string }
  | { kind: "nul" };

/** One element of what came before a contextual row's keystroke. */
export type LayoutContextElement =
  | { kind: "text"; text: string }
  | { kind: "deadkey"; deadkeyId: string };

/** What came before, for a contextual row (deadkey-keystroke and literal-context rows). */
export type LayoutContext = readonly LayoutContextElement[];

/** What context + keystroke become: literal text, optionally with deadkeys, or nothing. */
export type LayoutBecomes = readonly LayoutContextElement[] | { kind: "nul" };

/** One Layout-tab edit. `seq` is monotonic per draft; `at` is a timestamp (ms). */
export type LayoutOperation = { seq: number; at: number } & (
  | { op: "set-key"; vkey: string; layer: LayerCombo; output: LayoutOutput }
  /** Drop the author's override: replay drops the earlier `set-key`s for this slot. */
  | { op: "clear-key"; vkey: string; layer: LayerCombo }
  | { op: "set-row"; vkey: string; layer: LayerCombo; context: LayoutContext; becomes: LayoutBecomes }
  | { op: "remove-row"; vkey: string; layer: LayerCombo; context: LayoutContext }
  /** No IR effect: recorded so the case-partner proposal is not offered again. */
  | { op: "decline-case-partner"; vkey: string; layer: LayerCombo; partner: string }
);
