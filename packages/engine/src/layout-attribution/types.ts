// Types for the Layout-tab attribution engine (spec 117, contracts/attribution.md).

import type { LayerCombo, LayoutBecomes, LayoutContext, LayoutOutput } from "@keyboard-studio/contracts";

/** The structural family of a rule that matches a key. */
export type RowShape =
  | "context-free" // + [layer vkey] > ...
  | "deadkey-keystroke" // dk(x) + [layer vkey] > ...
  | "deadkey-fanout" // dk(x) + any(bases) > index(outs, n)  (spec 083 shape, research R3)
  | "literal-context" // 'n' + [layer vkey] > ...   (text and/or deadkeys)
  | "store-based" // any other any()/index()/notany()
  | "conditional" // if(), platform(), options
  | "opaque"; // RawKmnFragment

/** Why a row or cell is read-only. */
export type ReadOnlyReason =
  | "store-based"
  | "conditional"
  | "opaque"
  | "readonly-group" // the rule sits in a readonly group
  | "complex-output" // beep, context(n) reordering, index() outside the fan-out shape
  | "later-group-change"
  | "never-fires"
  | "mnemonic"
  | "frame-key"
  | "not-compiled";

export interface RowAttribution {
  ruleNodeId: string;
  shape: RowShape;
  /** What came before the keystroke; `[]` for context-free. */
  context: LayoutContext;
  /** Literal output; `null` when the rule's output is not literal. */
  output: LayoutOutput | LayoutBecomes | null;
  editable: boolean;
  readOnlyReason?: ReadOnlyReason;
  provenance: "hand-set" | "starting-point";
  /** Which editor wrote the rule, when `provenance` is `hand-set` through `authorEdit`. */
  authorEdit?: "layout-tab" | "code-tab";
  /** `deadkey-fanout` rows: the 0-based position of this key's base character in the rule's stores. */
  fanoutIndex?: number;
}

export interface KeyCellAttribution {
  vkey: string;
  layer: LayerCombo;
  /** The context-free behaviour, if any. */
  plain: RowAttribution | null;
  /** Contextual rows on this key (deadkey and literal), plus context-free rows that are not `plain`. */
  rows: RowAttribution[];
  /** No rule handles the key: base-keyboard fallback (FR-014). */
  unhandled: boolean;
  frame: boolean;
}
