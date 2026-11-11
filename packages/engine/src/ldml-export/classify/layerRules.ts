// Automatic touch layer behaviour (mapping rows 1.3, 1.4, 1.4a, 1.4b; FR-026; task T071).
//
// `begin PostKeystroke` and `begin NewContext` groups are `readonly` in KMN, so they never change
// text; they only choose the touch layer. LDML's only layer control is `key/@layerId` on the pressed
// key, so a result is exportable exactly when it depends on the current layer and the key just
// pressed. The groups are evaluated statically for every (touch layer, key output) pair:
//
//   - `if(&layer = 'x')` is true for one layer, `if(&newLayer = "")` is true (the author's key did
//     not switch layer itself, or the key's own `layerId` wins anyway);
//   - a single `char` or `any(store)` context element matches the key's own output;
//   - anything else that reads earlier text (`nul`, two or more text elements, an option guard) is a
//     behaviour LDML cannot express. It is never emulated: it is reported once per behaviour (1.4b).
//
// Rule texts come only through rawText.ts (Constitution Art II).

import type { ContextElement, IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { ruleConditions, ruleHasNulContext, ruleLhsKind, rulePreContext } from "@keyboard-studio/contracts";
import type { CallGraph } from "./callGraph.js";
import type { ItemSink } from "./items.js";
import { layerOf, platformOf, setLayerOf, parseUseCall, isNulToken } from "./rawText.js";
import { findStore, platformTruth, storeLiterals } from "./ruleElements.js";

/** A KMN layer name's modifier state on a hardware keyboard (one place, shared with the touch lowering). */
export interface LayerModifierState {
  components: string[];
  caps: boolean;
}

const WORD_COMPONENT: Record<string, string> = {
  shift: "shift",
  leftalt: "altL",
  rightalt: "altR",
  leftctrl: "ctrlL",
  rightctrl: "ctrlR",
  alt: "alt",
  ctrl: "ctrl",
};

const COMPONENT_ORDER = ["ctrl", "ctrlL", "ctrlR", "alt", "altL", "altR", "shift"];

/**
 * The hardware modifier state a touch layer name stands for (`default` none, `shift`, `caps`,
 * `rightalt-shift`, ...). A name that is no modifier word (`numeric`, `symbols`) sends its keys
 * with no modifiers, so it maps to the default state.
 */
export function touchLayerModifiers(name: string): LayerModifierState {
  const words = name.toLowerCase().split("-");
  const comps = new Set<string>();
  let caps = false;
  for (const w of words) {
    if (w === "caps") caps = true;
    else {
      const c = WORD_COMPONENT[w];
      if (c !== undefined) comps.add(c);
    }
  }
  return { components: COMPONENT_ORDER.filter((c) => comps.has(c)), caps };
}

/** The touch form's layer id for a KMN layer name (`default` becomes `base`, row 5.4). */
export function touchLayerId(name: string): string {
  return name === "default" ? "base" : name;
}

/** One behaviour the export cannot carry (row 1.4b). */
export interface LayerBehaviour {
  /** The `behaviour:<name>` nodeKey suffix. */
  name: string;
  /** English wording of what is lost, for the item's consequence. */
  lost: string;
  line: number | null;
  owner: string;
}

export interface LayerRules {
  /** Sorted by name. */
  behaviours: LayerBehaviour[];
  /** True when some (layer, key) pair gets a layer other than its own. */
  hasDecisions: boolean;
  /** True when the keyboard has a PostKeystroke or NewContext group at all. */
  present: boolean;
  /**
   * The layer a key that types `output` (null: no text) leaves `from` on, or null when it stays.
   * Only meaningful for a key with no `nextlayer` of its own.
   */
  next(from: string, output: string | null): string | null;
}

type Outcome = string | null; // a layer name, or null for "no change"
type Match = "no" | "yes" | "maybe" | "text";

const key = (s: string): string => s.toLowerCase();

interface Eval {
  ir: KeyboardIR;
  behaviours: Map<string, LayerBehaviour>;
}

/** Every context element of the rule, in source order, without the `+` separator. */
function plusFree(rule: IRRule): ContextElement[] {
  const group = { usingKeys: false };
  return [
    ...(ruleHasNulContext(rule) ? [{ kind: "raw", text: "nul" } as const] : []),
    ...ruleConditions(rule),
    ...rulePreContext(rule, group),
  ];
}

function textBehaviour(rule: IRRule, group: IRGroup, guards: readonly ContextElement[], text: readonly ContextElement[], outcomes: Outcome[]): LayerBehaviour {
  const owner = `group ${group.name}`;
  const owned = rule.ownedByBehaviour;
  const line = rule.sourceLine ?? null;
  if (owned !== undefined && owned !== "") return { name: owned, lost: `the "${owned}" layer behaviour`, line, owner };
  if (text.some((el) => el.kind === "raw" && isNulToken(el.text))) {
    return { name: "start-of-field", lost: "start-of-field auto-shift (the touch form always starts on its base layer)", line, owner };
  }
  if (guards.some((el) => el.kind === "if")) {
    return { name: "option-dependent-layer", lost: "a layer choice that depends on an option store", line, owner };
  }
  if (outcomes.includes("shift")) {
    return { name: "start-of-sentence-shift", lost: "start-of-sentence auto-shift (the shift layer after sentence punctuation and a space)", line, owner };
  }
  return { name: "text-dependent-layer", lost: "a layer choice that depends on earlier text", line, owner };
}

function classifyRule(
  ev: Eval,
  rule: IRRule,
  layer: string,
  out: string | null | "*",
): { match: Match; guards: ContextElement[]; text: ContextElement[] } {
  const guards: ContextElement[] = [];
  const text: ContextElement[] = [];
  let falseGuard = false;
  for (const el of plusFree(rule)) {
    if (el.kind === "if") {
      const s = key(el.store);
      if (s === "&layer") {
        guards.push(el);
        if (el.value !== layer) falseGuard = true;
      } else if (s === "&newlayer") {
        guards.push(el);
        if (el.value !== "") falseGuard = true;
      } else guards.push(el);
    } else if (platformOf(el) !== null) {
      const t = platformTruth(platformOf(el) as string);
      guards.push(el);
      if (!t.touch) falseGuard = true;
    } else if (el.kind === "baselayout") {
      guards.push(el);
    } else text.push(el);
  }
  if (falseGuard) return { match: "no", guards, text };
  const optionGuard = guards.some((g) => g.kind === "if" && key(g.store) !== "&layer" && key(g.store) !== "&newlayer");
  if (optionGuard) return { match: "text", guards, text };
  if (text.length === 0) return { match: "yes", guards, text };
  if (text.length > 1) return { match: "text", guards, text };
  const el = text[0] as ContextElement;
  let literals: string[] | null = null;
  if (el.kind === "char") literals = [el.value];
  else if (el.kind === "any") {
    const s = findStore(ev.ir, el.storeRef);
    const lits = s === undefined ? [] : storeLiterals(s);
    if (s !== undefined && lits.length > 0 && lits.every((x) => x !== null)) literals = lits as string[];
  }
  if (literals === null) return { match: "text", guards, text };
  if (out === "*") return { match: "maybe", guards, text };
  if (out === null) return { match: "no", guards, text };
  return { match: literals.includes(out) ? "yes" : "no", guards, text };
}

function outcomeOf(
  ev: Eval,
  rule: IRRule,
  layer: string,
  out: string | null | "*",
  depth: number,
): Outcome[] {
  let cur: Outcome[] = [null];
  for (const el of rule.output) {
    if (el.kind === "context") continue;
    if (el.kind === "useGroup" || el.kind === "raw") {
      const target = el.kind === "useGroup" ? el.groupName : parseUseCall(el.text);
      if (target !== null) {
        const g = ev.ir.groups.find((x) => key(x.name) === key(target));
        const called = g === undefined || depth > 12 ? [null] : runGroup(ev, g, layer, out, depth + 1);
        const next = new Set<Outcome>();
        for (const p of cur) for (const o of called) next.add(o ?? p);
        cur = [...next];
        continue;
      }
    }
    const l = layerOf(el) ?? setLayerOf(el);
    if (l !== null) {
      cur = [l];
      continue;
    }
    // Any other output element is not a layer effect; a readonly group cannot output text.
  }
  return cur;
}

function runGroup(ev: Eval, g: IRGroup, layer: string, out: string | null | "*", depth: number): Outcome[] {
  const results = new Set<Outcome>();
  let unmatched = true;
  let matched = false;
  const note = (rule: IRRule, guards: ContextElement[], text: ContextElement[]): void => {
    const b = textBehaviour(rule, g, guards, text, outcomeOf(ev, rule, layer, out, depth));
    if (!ev.behaviours.has(b.name)) ev.behaviours.set(b.name, b);
  };
  for (const rule of g.rules) {
    if (ruleLhsKind(rule) === "nomatch") {
      if (unmatched) {
        const c = classifyRule(ev, rule, layer, out);
        if (c.match === "yes") {
          for (const o of outcomeOf(ev, rule, layer, out, depth)) results.add(o);
          unmatched = false;
        } else if (c.match === "maybe") for (const o of outcomeOf(ev, rule, layer, out, depth)) results.add(o);
        else if (c.match === "text") note(rule, c.guards, c.text);
      }
      continue;
    }
    if (ruleLhsKind(rule) === "match") {
      if (matched) for (const o of outcomeOf(ev, rule, layer, out, depth)) results.add(o);
      continue;
    }
    if (!unmatched) continue;
    const c = classifyRule(ev, rule, layer, out);
    if (c.match === "yes") {
      for (const o of outcomeOf(ev, rule, layer, out, depth)) results.add(o);
      unmatched = false;
      matched = true;
    } else if (c.match === "maybe") {
      for (const o of outcomeOf(ev, rule, layer, out, depth)) results.add(o);
      matched = true;
    } else if (c.match === "text") note(rule, c.guards, c.text);
  }
  if (unmatched) results.add(null);
  return [...results];
}

/**
 * Evaluate the keyboard's PostKeystroke and NewContext groups over `layers` (touch layer names,
 * KMN spelling, `default` for the base layer).
 */
export function analyseLayerRules(ir: KeyboardIR, graph: CallGraph, layers: readonly string[]): LayerRules {
  const ev: Eval = { ir, behaviours: new Map() };
  const post = [...graph.facts.values()].filter((f) => f.reserved === "postKeystroke").map((f) => f.group);
  const fresh = [...graph.facts.values()].filter((f) => f.reserved === "newContext").map((f) => f.group);
  const names = layers.length === 0 ? ["default"] : [...layers];
  let hasDecisions = false;

  for (const g of post) {
    for (const L of names) {
      for (const o of runGroup(ev, g, L, "*", 0)) if (o !== null && o !== L) hasDecisions = true;
    }
  }
  // NewContext fires on focus with no key: the form starts on its base layer, so only a start
  // layer other than the default is a loss.
  for (const g of fresh) {
    for (const o of runGroup(ev, g, "default", null, 0)) {
      if (o !== null && o !== "default" && o !== "base") {
        const name = `focus-layer-${o}`;
        if (!ev.behaviours.has(name)) {
          ev.behaviours.set(name, {
            name,
            lost: `starting on the "${o}" layer when a field gains focus (the touch form always starts on its base layer)`,
            line: g.sourceLine ?? null,
            owner: `group ${g.name}`,
          });
        }
      }
    }
  }

  const behaviours = [...ev.behaviours.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    behaviours,
    hasDecisions,
    present: post.length > 0 || fresh.length > 0,
    next(from, output) {
      let result: Outcome = null;
      for (const g of post) {
        const quiet: Eval = { ir, behaviours: new Map() };
        const outs = runGroup(quiet, g, from, output, 0);
        const o = outs.find((x) => x !== null) ?? null;
        if (o !== null) result = o;
      }
      return result === from ? null : result;
    },
  };
}

/**
 * Items for the evaluated groups: one 1.4b item per lost behaviour (`nodeKey` `behaviour:<name>`),
 * and one 1.4a item when some key's layer switch carries over as `layerId`.
 */
export function addLayerRuleItems(rules: LayerRules, sink: ItemSink, touchPresent: boolean): void {
  for (const b of rules.behaviours) {
    const item = sink.add("1.4b", {
      nodeKey: `behaviour:${b.name}`,
      line: b.line,
      owner: b.owner,
      side: "touch",
      isRule: true,
      params: { behaviour: b.name },
    });
    item.consequence = `Not exported: ${b.lost}. A touch key's layerId is unconditional and a touch form always starts on its base layer.`;
  }
  if (touchPresent && rules.hasDecisions) {
    sink.add("1.4a", { nodeKey: "behaviour:layer-state", side: "touch", params: { behaviour: "layer-state" } });
  }
}
