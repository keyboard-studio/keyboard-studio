# Contract: layout attribution

The read side of the honesty rule ([research.md](../research.md) R3, R4). Two passes: a pure
static pass in the engine, and a verification pass in the studio against the single published
compile artifact (no new compile, no new timer — decision D3).

## Engine: `packages/engine/src/layout-attribution/` (pure, IR only)

```ts
type RowShape =
  | "context-free"            // + [layer vkey] > ...
  | "deadkey-keystroke"       // dk(x) + [layer vkey] > ...
  | "deadkey-fanout"          // dk(x) + any(bases) > index(outs, n)  — spec 083 shape (R3)
  | "literal-context"         // 'n' + [layer vkey] > ...   (text and/or deadkeys)
  | "store-based"             // any other any()/index()/notany()
  | "conditional"             // if(), platform(), options
  | "opaque";                 // RawKmnFragment

type ReadOnlyReason =
  | "store-based" | "conditional" | "opaque" | "later-group-change"
  | "never-fires" | "mnemonic" | "frame-key" | "not-compiled";

interface RowAttribution {
  ruleNodeId: string;
  shape: RowShape;
  context: LayoutContext;          // [] for context-free
  output: LayoutOutput | LayoutBecomes | null;   // null when not literal
  editable: boolean;
  readOnlyReason?: ReadOnlyReason;
  provenance: "hand-set" | "starting-point";
}

interface KeyCellAttribution {
  vkey: string;
  layer: LayerCombo;
  plain: RowAttribution | null;    // the context-free behaviour, if any
  rows: RowAttribution[];          // contextual rows on this key (deadkey and literal)
  unhandled: boolean;              // no rule: base-keyboard fallback (FR-014)
  frame: boolean;
}

function attributeLayer(ir: KeyboardIR, layer: LayerCombo, vkeys: readonly string[]): KeyCellAttribution[];
function listLayers(ir: KeyboardIR): LayerCombo[];          // wraps collectLayerCombosInUse
function listContexts(ir: KeyboardIR): Array<{ context: LayoutContext; keyCount: number }>;
function isMnemonic(ir: KeyboardIR): boolean;
```

Rules: FR-013 as amended (per behaviour; R3's fan-out exemption). Provenance `hand-set` iff the
rule carries `layoutTabOwned`, or the character is in an Assign-tab assignment for that slot.

## Engine: simulator addition

```ts
/** Simulate each input independently from the same seed, loading the keyboard once. */
function simulateEach(
  compiled: CompileResult,
  inputs: readonly SimKeyInput[],
  seed?: SimulatorContextSeed,
): SimulationStep[];
```

## Studio: verification

`useLayoutAttribution(layer, context?)` reads `rulesDemoArtifactStore` (the D3 artifact), runs
`attributeLayer`, then `simulateEach` with an empty seed (or the chosen "after …" context), and
demotes any editable row whose simulated output differs from its own output to
`later-group-change`. Fired-rule identity is checked through `firedRuleMapping`. While the
artifact is not ready, every cell is `not-compiled` and the last good result is shown stale
(FR-018).

## Studio: base fallback join

For `unhandled` cells: `enumerateUnhandledPositions` + `referenceBaseLayouts.lookupHostOutput` for
each picked base keyboard (`usePickedWindowsLayouts`); primary first. No reference data, or a layer
outside none/shift/altgr/shiftAltgr: "unknown"; Ctrl/Alt+letter: "system shortcut".
