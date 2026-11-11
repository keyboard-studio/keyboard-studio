// desktopGridViewModel — geometry x attribution x base fallback -> one view model per grid cell
// (spec 117 FR-010..FR-014, FR-018). Pure: a grid component renders `DesktopCellViewModel`
// without knowing the engine. Provenance and output are the two axes of FR-012; the
// has-contextual-rows flag is separate and never makes a cell read-only.

import { DESKTOP_ISO_GEOMETRY } from "@keyboard-studio/engine";
import type {
  CellStep,
  DesktopIsoGeometryKey,
  KeyCellAttribution,
  ReadOnlyReason,
  RowAttribution,
} from "@keyboard-studio/engine";
import type { LayerCombo, LayoutContext, SimulationStep } from "@keyboard-studio/contracts";
import type { BaseFallbackDetail } from "./baseFallbackCells.ts";
import type { LayoutAttributionState } from "./useLayoutAttribution.ts";

/** Where a cell's behaviour comes from (FR-012). Frame keys have none (`null`). */
export type CellProvenance = "hand-set" | "starting-point" | "base-fallback";

/**
 * What a cell does (FR-012's output axis, plus the base-fallback outcomes that carry no
 * character). Base-fallback cells use the same kinds: `text` or `deadkey` for a base keyboard
 * character or deadkey, `unknown` or `system-shortcut` when there is no character to show.
 */
export type CellKind =
  | "text"
  | "deadkey"
  /** `nul`: the key types nothing. */
  | "nothing"
  /** Stores, indexes, `if()`, `platform()`, options, beep, or changed by a later group. */
  | "complex"
  /** Touched by an opaque fragment the codec could not model ("code the studio cannot show here"). */
  | "opaque"
  | "frame"
  | "unknown"
  | "system-shortcut";

/**
 * The character class a base keyboard's fallback character falls in (spec 109 FR-020: Unicode
 * General Category; letters L* and marks M*, digits Nd, punctuation and symbols P* and S*).
 */
export type FallbackClass = "letters" | "digits" | "punctuation";

/** The class of a fallback outcome; null when the base keyboard types no classifiable character. */
export function fallbackClassOf(detail: BaseFallbackDetail | undefined): FallbackClass | null {
  if (detail?.outcome.kind !== "character") return null;
  const text = detail.outcome.text;
  if (/^[\p{L}\p{M}]/u.test(text)) return "letters";
  if (/^\p{Nd}/u.test(text)) return "digits";
  if (/^[\p{P}\p{S}]/u.test(text)) return "punctuation";
  return null;
}

export interface DesktopCellViewModel {
  /** The Keyman virtual key, e.g. `K_A`; `K_oE2` for the ISO extra key. */
  vkey: string;
  layer: LayerCombo;
  /** Grid position (key-width units; rows count from 0): from `DESKTOP_ISO_GEOMETRY`. */
  row: number;
  x: number;
  width: number;
  /**
   * What to draw when `display` is null: the key's short name (`A`, `BKQUOTE`). `K_oE2` keeps its
   * full name, since the physical key has no standard caption and a base keyboard may lack it.
   */
  keyLabel: string;
  /** Outside the editable layout block (Backspace, Tab, Enter, Shift, Space, ...). Never editable. */
  frame: boolean;
  /** Where the behaviour comes from; null for frame keys. */
  provenance: CellProvenance | null;
  /** Which editor wrote a hand-set rule, when attribution knows. */
  authorEdit?: "layout-tab" | "code-tab";
  /** What the key does; see {@link CellKind}. */
  kind: CellKind;
  /**
   * The text to draw: the character(s) the key types with nothing before it, as compiled. Null
   * when there is nothing to draw (types nothing, unknown fallback, not compiled, opaque, frame,
   * or complex output the simulator could not show).
   */
  display: string | null;
  /** Set when `kind` is `deadkey` and the key's own output is a deadkey. */
  deadkey?: {
    /** The deadkey's id as the keyboard names it (`acute`, `0001`). */
    id: string;
    /** What to draw for it: the id (no display character is derivable from the rules alone). */
    display: string;
    /** Number of keys that complete a combination after this deadkey (0 when unknown). */
    combinationCount: number;
  };
  /** True when the Layout tab may change this cell's output. Never true for frame, not-compiled, or mnemonic cells. */
  editable: boolean;
  /** Why a non-editable, non-frame cell is read-only. `frame-key` for frame cells. */
  readOnlyReason?: ReadOnlyReason;
  /** The key also takes part in deadkey combinations or contextual replacements ("after ..." rows). Informational only. */
  hasContextualRows: boolean;
  /**
   * The key is typed by the base keyboard's fallback and nobody has confirmed it (FR-030): true
   * for a non-frame `base-fallback` cell whose character class has no confirmed fallback policy.
   * An assigned or starting-point key is never provisional (SC-006).
   */
  provisional: boolean;
  /** The class of the base keyboard's character on a base-fallback cell, when it has one. */
  fallbackClass?: FallbackClass;
  /** Number of rules attribution found for the key in this layer (plain plus rows). */
  ruleCount: number;
  /** `ready`, `stale` (last good result while recompiling or after a failed compile), or `not-compiled` (no `.js` yet; never a guess). */
  state: LayoutAttributionState;
  /** Base-keyboard detail; present exactly when `provenance` is `base-fallback`. */
  baseFallback?: BaseFallbackDetail;
  /** The raw attribution, for the detail panel (plain behaviour and contextual rows). */
  attribution: KeyCellAttribution;
}

export interface DesktopGridViewModel {
  layer: LayerCombo;
  state: LayoutAttributionState;
  /** In geometry order. */
  cells: DesktopCellViewModel[];
  /** Number of grid rows (geometry rows, including the space row). */
  rowCount: number;
}

export interface DesktopGridViewModelInput {
  layer: LayerCombo;
  /** Attribution of the layer's keys, already verified (or demoted to `not-compiled`). */
  cells: readonly KeyCellAttribution[];
  state: LayoutAttributionState;
  /** The simulated keystrokes; used to show what a "changed by a later group" key really types. */
  steps?: readonly CellStep[];
  /** The keyboard is mnemonic: every cell is read-only. */
  mnemonic?: boolean;
  /** Base-keyboard fallback for the layer's unhandled positions (from `baseFallbackCells`). */
  baseFallback?: ReadonlyMap<string, BaseFallbackDetail>;
  /** From `listContexts(ir)`: the number of keys per context, for a deadkey's combination count. */
  contexts?: ReadonlyArray<{ context: LayoutContext; keyCount: number }>;
  /**
   * Character classes whose fallback policy the author has confirmed (spec 109). Keys of these
   * classes are not provisional. Empty until the confirmation is stored; the Layout tab never sets it.
   */
  confirmedClasses?: ReadonlySet<FallbackClass>;
  geometry?: readonly DesktopIsoGeometryKey[];
}

const COMPLEX_REASONS: ReadonlySet<ReadOnlyReason> = new Set([
  "store-based",
  "conditional",
  "complex-output",
  "later-group-change",
]);

function keyLabelOf(vkey: string): string {
  return vkey === "K_oE2" ? vkey : vkey.replace(/^K_/, "");
}

function combinationCount(
  id: string,
  contexts: ReadonlyArray<{ context: LayoutContext; keyCount: number }> | undefined,
): number {
  const want = id.toLowerCase();
  for (const c of contexts ?? []) {
    const only = c.context.length === 1 ? c.context[0] : undefined;
    if (only?.kind === "deadkey" && only.deadkeyId.toLowerCase() === want) return c.keyCount;
  }
  return 0;
}

function plainOutput(plain: RowAttribution): { kind: CellKind; display: string | null; deadkeyId?: string } {
  if (plain.readOnlyReason === "opaque") return { kind: "opaque", display: null };
  const out = plain.output;
  if (out === null || Array.isArray(out) || !("kind" in out)) return { kind: "complex", display: null };
  if (out.kind === "text") return { kind: "text", display: out.text };
  if (out.kind === "deadkey") return { kind: "deadkey", display: null, deadkeyId: out.deadkeyId };
  return { kind: "nothing", display: null };
}

function fallbackKind(detail: BaseFallbackDetail | undefined): CellKind {
  switch (detail?.outcome.kind) {
    case "character":
      return "text";
    case "deadkey":
      return "deadkey";
    case "system-shortcut":
      return "system-shortcut";
    default:
      return "unknown";
  }
}

/**
 * The empty-context step of an unhandled key when a compiled rule fired for it. A step without
 * a fired rule is the simulator's own default output, which is never shown (FR-014).
 */
function compiledOnlyStep(steps: readonly CellStep[] | undefined, vkey: string): SimulationStep | undefined {
  const found = steps?.find((s) => s.vkey === vkey && (s.context === undefined || s.context.length === 0));
  return found !== undefined && found.step.firedRule !== undefined ? found.step : undefined;
}

/** What a compiled-only rule types: text, one pending deadkey, or nothing. */
function compiledOutput(step: SimulationStep): {
  kind: CellKind;
  display: string | null;
  deadkey?: { id: string; display: string };
} {
  if (step.outputAfter !== "") return { kind: "text", display: step.outputAfter };
  const [only, ...more] = step.pendingDeadkeys;
  if (only !== undefined && more.length === 0) {
    const id = only.id.toString(16).padStart(4, "0");
    return { kind: "deadkey", display: null, deadkey: { id, display: id } };
  }
  return { kind: "nothing", display: null };
}

function buildCell(g: DesktopIsoGeometryKey, input: DesktopGridViewModelInput, a: KeyCellAttribution): DesktopCellViewModel {
  const base = {
    vkey: g.id,
    layer: input.layer,
    row: g.row,
    x: g.x,
    width: g.width,
    keyLabel: keyLabelOf(g.id),
    frame: a.frame,
    state: input.state,
    provisional: false,
    hasContextualRows: a.rows.some((r) => r.context.length > 0),
    ruleCount: (a.plain === null ? 0 : 1) + a.rows.length,
    attribution: a,
  };

  if (a.frame) {
    return {
      ...base,
      provenance: null,
      kind: "frame",
      display: null,
      editable: false,
      readOnlyReason: "frame-key",
      hasContextualRows: false,
    };
  }

  const notCompiled = input.state === "not-compiled";
  const mnemonic = input.mnemonic === true;

  if (a.plain === null) {
    // The compiled keyboard has a rule the working IR does not carry (an Assign-tab assignment
    // reaches the artifact only through the projection): show what it types, as hand-set.
    const compiled = notCompiled ? undefined : compiledOnlyStep(input.steps, g.id);
    if (compiled !== undefined) {
      const editable = !mnemonic;
      const out = compiledOutput(compiled);
      return {
        ...base,
        provenance: "hand-set",
        kind: out.kind,
        display: out.display,
        ...(out.deadkey !== undefined ? { deadkey: { ...out.deadkey, combinationCount: combinationCount(out.deadkey.id, input.contexts) } } : {}),
        editable,
        ...(!editable ? { readOnlyReason: "mnemonic" as ReadOnlyReason } : {}),
      };
    }
    // No rule: the base keyboard's character (FR-014), unless nothing is compiled to compare with.
    const detail = a.unhandled ? input.baseFallback?.get(g.id) : undefined;
    const kind = notCompiled ? "unknown" : fallbackKind(detail);
    const editable = !notCompiled && !mnemonic;
    const fallbackClass = fallbackClassOf(detail);
    const confirmed = fallbackClass !== null && input.confirmedClasses?.has(fallbackClass) === true;
    return {
      ...base,
      provisional: !confirmed,
      ...(fallbackClass !== null ? { fallbackClass } : {}),
      provenance: "base-fallback",
      kind,
      display: notCompiled ? null : (detail?.display ?? null),
      editable,
      ...(!editable ? { readOnlyReason: (notCompiled ? "not-compiled" : "mnemonic") as ReadOnlyReason } : {}),
      ...(detail !== undefined && !notCompiled ? { baseFallback: detail } : {}),
    };
  }

  const plain = a.plain;
  const shown = plainOutput(plain);
  let { kind, display } = shown;
  if (plain.readOnlyReason !== undefined && COMPLEX_REASONS.has(plain.readOnlyReason) && kind !== "opaque") kind = "complex";
  if (plain.readOnlyReason === "later-group-change") {
    // The stored rule is not what the keyboard types: show what the compiled keyboard did.
    const step = input.steps?.find(
      (s) => s.vkey === g.id && (s.context === undefined || s.context.length === 0),
    );
    display = step !== undefined && step.step.outputAfter !== "" ? step.step.outputAfter : null;
  } else if (kind === "complex") {
    display = null;
  }
  if (notCompiled) display = null;

  const deadkey =
    kind === "deadkey" && shown.deadkeyId !== undefined && !notCompiled
      ? { id: shown.deadkeyId, display: shown.deadkeyId, combinationCount: combinationCount(shown.deadkeyId, input.contexts) }
      : undefined;

  const editable = plain.editable && !notCompiled && !mnemonic;
  const reason: ReadOnlyReason | undefined = editable
    ? undefined
    : notCompiled
      ? "not-compiled"
      : (plain.readOnlyReason ?? (mnemonic ? "mnemonic" : undefined));
  return {
    ...base,
    provenance: plain.provenance,
    ...(plain.authorEdit !== undefined ? { authorEdit: plain.authorEdit } : {}),
    kind,
    display,
    ...(deadkey !== undefined ? { deadkey } : {}),
    editable,
    ...(reason !== undefined ? { readOnlyReason: reason } : {}),
  };
}

/** How many cells of a layer are provisional (FR-030). */
export function countProvisional(cells: readonly DesktopCellViewModel[]): number {
  return cells.reduce((n, c) => (c.provisional ? n + 1 : n), 0);
}

/** One view model per key of the ISO desktop grid, for one layer. */
export function buildDesktopGridViewModel(input: DesktopGridViewModelInput): DesktopGridViewModel {
  const geometry = input.geometry ?? DESKTOP_ISO_GEOMETRY;
  const byVkey = new Map(input.cells.map((c) => [c.vkey, c]));
  const cells: DesktopCellViewModel[] = [];
  for (const g of geometry) {
    const a = byVkey.get(g.id);
    if (a !== undefined) cells.push(buildCell(g, input, a));
  }
  const rowCount = geometry.reduce((n, g) => Math.max(n, g.row + 1), 0);
  return { layer: input.layer, state: input.state, cells, rowCount };
}
