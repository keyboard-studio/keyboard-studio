// Classify one rule or opaque fragment for the Layout tab: which key(s) and layer(s)
// it answers, its structural shape, its literal output, and whether the tab may edit
// it (spec 113 FR-012 / FR-013, research R3; contracts/attribution.md).
//
// Static and IR-only: whether a LATER group rewrites the result is not decidable
// here; `verifyCells` demotes those against the simulator.

import { isPlusSeparator, US_BASE_LAYOUT } from "@keyboard-studio/contracts";
import type {
  ContextElement,
  IRGroup,
  IRRule,
  KeyboardIR,
  LayerCombo,
  LayoutBecomes,
  LayoutContext,
  LayoutContextElement,
  LayoutOutput,
  ModifierToken,
  OutputElement,
  RawKmnFragment,
  StoreItem,
} from "@keyboard-studio/contracts";
import type { ReadOnlyReason, RowShape } from "./types.js";

/** One physical key in one layer. */
export interface KeyRef {
  vkey: string;
  layer: LayerCombo;
}

/** A spec 083 deadkey table: `dk(x) + any(bases) > index(outs, n)` over parallel plain-character stores. */
export interface FanoutTable {
  deadkeyId: string;
  baseStore: string;
  outStore: string;
  pairs: Array<{ base: string; result: string }>;
}

export interface RuleClassification {
  shape: RowShape;
  /** Keys the keystroke side answers; empty when it names no resolvable key (fan-out, `match`, unresolved). */
  keys: KeyRef[];
  /** Literal pre-context (`[]` for context-free; conditions are not part of it). */
  context: LayoutContext;
  /** Literal output; `null` when not literal. */
  output: LayoutOutput | LayoutBecomes | null;
  editable: boolean;
  readOnlyReason?: ReadOnlyReason;
  /** No context besides conditions: the rule is a candidate for the key's plain behaviour. */
  contextFree: boolean;
  /** Always matches when its key is struck (no condition, not opaque): later context-free rules on the key never fire. */
  alwaysMatches: boolean;
  provenance: "hand-set" | "starting-point";
  authorEdit?: "layout-tab" | "code-tab";
  fanout?: FanoutTable;
}

/** `[SHIFT RALT K_A]` -> its modifier words and vkey; `null` when it is not a single bracketed key. */
export function parseBracketKey(text: string): { vkey: string; modifiers: string[] } | null {
  const m = /^\s*\[\s*((?:[A-Za-z]+\s+)*)(K_[A-Za-z0-9_]+|U_[0-9A-Fa-f]+)\s*\]\s*$/.exec(text);
  if (m === null) return null;
  return { vkey: m[2]!, modifiers: (m[1] ?? "").split(/\s+/).filter((w) => w.length > 0) };
}

function toLayer(modifiers: readonly string[]): LayerCombo {
  return modifiers.map((m) => m.toUpperCase()) as ModifierToken[];
}

// Character -> US key, inverted from contracts' US_BASE_LAYOUT (first writer wins,
// so space stays on the unshifted K_SPACE). Not the simulator's reverseUsLayout:
// that module loads the vendored Keyman engine, which must stay off the engine's
// main entry (see the note above the context-tolerance exports in index.ts).
let usKeyOfChar: Map<string, KeyRef> | null = null;

/** The key Keyman uses for a character key rule (`+ 'a'`): the US layout key that types it. */
function keyOfChar(ch: string): KeyRef | null {
  if (usKeyOfChar === null) {
    usKeyOfChar = new Map();
    for (const [key, char] of US_BASE_LAYOUT) {
      if (usKeyOfChar.has(char)) continue;
      const shifted = key.startsWith("S+");
      usKeyOfChar.set(char, { vkey: shifted ? key.slice(2) : key, layer: shifted ? ["SHIFT"] : [] });
    }
  }
  return usKeyOfChar.get(ch) ?? null;
}

function isCondition(el: ContextElement): boolean {
  if (el.kind === "if" || el.kind === "baselayout") return true;
  return el.kind === "raw" && /^\s*(platform|if|layer|baselayout)\s*\(/i.test(el.text);
}

function dkId(id: number): string {
  return id.toString(16).toLowerCase().padStart(4, "0");
}

function deadkeyIdOf(el: ContextElement): string | null {
  if (el.kind === "deadkey") return dkId(el.id);
  if (el.kind === "namedDeadkey") return el.name;
  return null;
}

/** Merge consecutive characters into one text element; `null` when an element is not text or a deadkey. */
function toLayoutContext(els: readonly (ContextElement | OutputElement)[]): LayoutContext | null {
  const out: LayoutContextElement[] = [];
  for (const el of els) {
    if (el.kind === "char") {
      const last = out[out.length - 1];
      if (last !== undefined && last.kind === "text") out[out.length - 1] = { kind: "text", text: last.text + el.value };
      else out.push({ kind: "text", text: el.value });
    } else if (el.kind === "deadkey") {
      out.push({ kind: "deadkey", deadkeyId: dkId(el.id) });
    } else if (el.kind === "namedDeadkey") {
      out.push({ kind: "deadkey", deadkeyId: el.name });
    } else {
      return null;
    }
  }
  return out;
}

function findStore(ir: KeyboardIR, name: string): { items: StoreItem[] } | undefined {
  const want = name.toLowerCase();
  return ir.stores.find((s) => !s.isSystem && s.name.toLowerCase() === want);
}

function plainCharList(store: { items: StoreItem[] } | undefined): string[] | null {
  if (store === undefined || store.items.length === 0) return null;
  const chars: string[] = [];
  for (const it of store.items) {
    if (it.kind !== "char") return null;
    chars.push(it.value);
  }
  return chars;
}

/** Keys an `any(store)` keystroke covers: characters via the US layout, vkey items and bracketed raw items directly. */
function keysOfStore(ir: KeyboardIR, storeRef: string): KeyRef[] {
  const store = findStore(ir, storeRef);
  if (store === undefined) return [];
  const keys: KeyRef[] = [];
  for (const it of store.items) {
    if (it.kind === "char") {
      const k = keyOfChar(it.value);
      if (k !== null) keys.push(k);
    } else if (it.kind === "vkey") {
      keys.push({ vkey: it.name, layer: [] });
    } else if (it.kind === "raw") {
      const b = parseBracketKey(it.text);
      if (b !== null) keys.push({ vkey: b.vkey, layer: toLayer(b.modifiers) });
    }
  }
  return keys;
}

function recognizeFanout(
  ir: KeyboardIR,
  pre: readonly ContextElement[],
  key: ContextElement,
  output: readonly OutputElement[],
): FanoutTable | null {
  if (pre.length !== 1 || key.kind !== "any" || output.length !== 1) return null;
  const dk = deadkeyIdOf(pre[0]!);
  const out = output[0]!;
  // `index(outs, n)` counts the deadkey as element 1, so the `any()` is element 2.
  if (dk === null || out.kind !== "index" || out.offset !== 2) return null;
  const bases = plainCharList(findStore(ir, key.storeRef));
  const results = plainCharList(findStore(ir, out.storeRef));
  if (bases === null || results === null || bases.length !== results.length) return null;
  return {
    deadkeyId: dk,
    baseStore: key.storeRef,
    outStore: out.storeRef,
    pairs: bases.map((base, i) => ({ base, result: results[i]! })),
  };
}

/** Output of a context-free rule: one text, one deadkey, or nul. */
function plainOutput(out: readonly OutputElement[]): LayoutOutput | null {
  if (out.length === 1 && out[0]!.kind === "nul") return { kind: "nul" };
  if (out.length > 0 && out.every((e) => e.kind === "char")) {
    return { kind: "text", text: out.map((e) => (e.kind === "char" ? e.value : "")).join("") };
  }
  const ctx = toLayoutContext(out);
  const first = ctx?.[0];
  return ctx?.length === 1 && first !== undefined && first.kind === "deadkey"
    ? { kind: "deadkey", deadkeyId: first.deadkeyId }
    : null;
}

/** Output of a contextual rule: text and deadkeys, or nul. */
function becomesOutput(out: readonly OutputElement[]): LayoutBecomes | null {
  if (out.length === 1 && out[0]!.kind === "nul") return { kind: "nul" };
  const ctx = toLayoutContext(out);
  return ctx !== null && ctx.length > 0 ? ctx : null;
}

function classifyFragment(fragment: RawKmnFragment): RuleClassification {
  const lhs = fragment.sourceText.split(">")[0] ?? "";
  const plus = lhs.indexOf("+");
  const keyText = plus >= 0 ? lhs.slice(plus + 1) : lhs;
  const pre = plus >= 0 ? lhs.slice(0, plus).trim() : "";
  const bracket = parseBracketKey(keyText);
  return {
    shape: "opaque",
    keys: bracket === null ? [] : [{ vkey: bracket.vkey, layer: toLayer(bracket.modifiers) }],
    context: [],
    output: null,
    editable: false,
    readOnlyReason: "opaque",
    // An opaque rule with no pre-context is treated as a context-free rule that might
    // fire first (when in doubt, read-only); one with pre-context is a contextual row.
    contextFree: pre.length === 0,
    alwaysMatches: false,
    provenance: "starting-point",
  };
}

/**
 * Classify one rule of `group`, or an opaque fragment. A `readonly` group makes every
 * rule in it read-only (reason `readonly-group`).
 */
export function classifyRule(ir: KeyboardIR, group: IRGroup, rule: IRRule | RawKmnFragment): RuleClassification {
  if ("sourceText" in rule) return classifyFragment(rule);

  const provenance: "hand-set" | "starting-point" = rule.authorEdit !== undefined ? "hand-set" : "starting-point";
  const authorEdit = rule.authorEdit !== undefined ? { authorEdit: rule.authorEdit } : {};

  // A match/nomatch rule has no keystroke: group control flow, not a key behaviour.
  if (rule.matchKind !== undefined) {
    return {
      shape: "conditional",
      keys: [],
      context: [],
      output: null,
      editable: false,
      readOnlyReason: "conditional",
      contextFree: false,
      alwaysMatches: false,
      provenance,
      ...authorEdit,
    };
  }

  const plusIdx = rule.context.findIndex(isPlusSeparator);
  const elems = rule.context.filter((e) => !isPlusSeparator(e));
  let pre: ContextElement[];
  let key: ContextElement | undefined;
  if (plusIdx >= 0) {
    pre = rule.context.slice(0, plusIdx).filter((e) => !isPlusSeparator(e));
    key = rule.context.slice(plusIdx + 1).filter((e) => !isPlusSeparator(e)).pop();
  } else if (elems.length === 1 || elems[elems.length - 1]?.kind === "vkey") {
    pre = elems.slice(0, -1);
    key = elems[elems.length - 1];
  } else {
    pre = elems;
    key = undefined;
  }

  const opaqueEl = elems.some((e) => e.kind === "raw" && !isCondition(e));
  const conditional = elems.some(isCondition);
  const preLit = pre.filter((e) => !isCondition(e));
  const preStore = preLit.some((e) => e.kind === "any" || e.kind === "notany" || e.kind === "index" || e.kind === "context");
  const contextFree = preLit.length === 0;

  let keys: KeyRef[] = [];
  if (key?.kind === "vkey") keys = [{ vkey: key.name, layer: toLayer(key.modifiers) }];
  else if (key?.kind === "char") {
    const k = keyOfChar(key.value);
    if (k !== null) keys = [k];
  } else if (key?.kind === "any") keys = keysOfStore(ir, key.storeRef);

  const fanout = conditional || key === undefined ? null : recognizeFanout(ir, preLit, key, rule.output);

  let shape: RowShape;
  if (opaqueEl) shape = "opaque";
  else if (conditional) shape = "conditional";
  else if (fanout !== null) shape = "deadkey-fanout";
  else if (key?.kind === "any" || key?.kind === "notany" || preStore) shape = "store-based";
  else if (contextFree) shape = "context-free";
  else if (preLit.length === 1 && deadkeyIdOf(preLit[0]!) !== null) shape = "deadkey-keystroke";
  else shape = "literal-context";

  const out = rule.output;
  const complexOut = out.some((e) => e.kind === "beep" || e.kind === "context" || e.kind === "useGroup" || e.kind === "raw");
  const indexOut = out.some((e) => e.kind === "index" || e.kind === "outs");

  let reason: ReadOnlyReason | undefined;
  if (shape === "opaque") reason = "opaque";
  else if (shape === "conditional") reason = "conditional";
  else if (shape === "store-based") reason = "store-based";
  else if (shape !== "deadkey-fanout" && (complexOut || indexOut)) reason = "complex-output";
  else if (group.readonly) reason = "readonly-group";

  let literal: LayoutOutput | LayoutBecomes | null = null;
  if (fanout === null && reason === undefined) {
    literal = shape === "context-free" ? plainOutput(out) : becomesOutput(out);
    if (literal === null) reason = "complex-output";
  }

  return {
    shape,
    keys: fanout !== null ? [] : keys,
    context:
      fanout !== null
        ? [{ kind: "deadkey", deadkeyId: fanout.deadkeyId }]
        : (toLayoutContext(preLit) ?? []),
    output: literal,
    editable: reason === undefined,
    ...(reason !== undefined ? { readOnlyReason: reason } : {}),
    contextFree,
    alwaysMatches: shape !== "conditional" && shape !== "opaque",
    provenance,
    ...authorEdit,
    ...(fanout !== null ? { fanout } : {}),
  };
}
