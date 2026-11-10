// Rule classification (mapping rows 1.x, 2.x, 3.1-3.26 at rule level; task T026).
//
// One call per rule produces its items and a RulePlan: what the lowering needs to
// know (is the rule lowered, its keystroke targets, what was evaluated away). The
// lowering never re-decides a status; it reads the plan.

import { assertNever, deadkeyNameKey, elementAtOffset, ruleLhsKind } from "@keyboard-studio/contracts";
import type {
  ContextElement,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  OutputElement,
  StoreItem,
} from "@keyboard-studio/contracts";
import type { LdmlForm } from "../lower/positions.js";
import type { LdmlBaseLayout, LdmlStatus, RowId } from "../types.js";
import { ruleCalls, type CallGraph, type GroupFacts } from "./callGraph.js";
import { storeText } from "./header.js";
import type { ItemSink } from "./items.js";
import {
  classifyVKey,
  formHasKey,
  analyseModifiers,
  storeKeyTargets,
  vkeyTarget,
  tableVKey,
  charTarget,
  splitRule,
  type KeyTarget,
  type Keystroke,
  type ResolveContext,
} from "./keystrokes.js";
import { isNulToken, parseLayerCall, parsePlatformCall } from "./rawText.js";

/** Cap on transforms from one rule (cartesian expansion); the lowering exports the same value. */
export const MAX_TRANSFORMS_PER_RULE = 1000;
/** Capture groups TR35 allows in `to` ($1-$9). */
export const MAX_CAPTURES = 9;

export interface PlannedTarget {
  target: KeyTarget;
  /** For `any()` in keystroke position: which store item this key stands for. */
  itemIndex: number | null;
}

export type SuppressKind = "nul" | "beep";

export interface RulePlan {
  nodeKey: string;
  group: IRGroup;
  rule: IRRule;
  ordinal: number;
  facts: GroupFacts;
  /** False when the rule is N, or evaluated away (a false guard or platform). */
  lower: boolean;
  keystroke: Keystroke | null;
  /** The keystroke's context element (for index() offsets). */
  keyElement: ContextElement | null;
  /** Context before the keystroke, with guards still in place (offsets count them). */
  pre: ContextElement[];
  anchorStart: boolean;
  targets: PlannedTarget[];
  /** Sole `nul` or `beep` output. */
  suppress: SuppressKind | null;
  /** The rule has real context (beyond guards, `nul`, platform and baselayout). */
  hasContext: boolean;
  backspace: boolean;
  /** `use(g)` calls in the rule's output. */
  calls: string[];
  /** index() lowers to one `$[1:set]` mapping (row 3.7), else cartesian (3.8). */
  setMapping: boolean;
}

export interface RuleEnv {
  ir: KeyboardIR;
  sink: ItemSink;
  rc: ResolveContext;
  form: LdmlForm;
  graph: CallGraph;
  baseLayout: LdmlBaseLayout;
  /** Deadkeys that some typed rule outputs. */
  deadkeysOutput: ReadonlySet<string>;
  /** Some non-mixed rule names a sided modifier (row 2.23). */
  sidedElsewhere: boolean;
}

export function dkKey(el: { kind: "deadkey"; id: number } | { kind: "namedDeadkey"; name: string }): string {
  return el.kind === "deadkey" ? `#${el.id}` : `n:${deadkeyNameKey(el.name)}`;
}

export function findStore(ir: KeyboardIR, name: string): IRStore | undefined {
  const n = name.toLowerCase();
  return ir.stores.find((s) => !s.isSystem && s.name.toLowerCase() === n);
}

/** True for context elements that produce no text: guards, anchors, conditions. */
export function isGuardElement(el: ContextElement): boolean {
  if (el.kind === "if" || el.kind === "baselayout") return true;
  if (el.kind === "raw") return isNulToken(el.text) || parsePlatformCall(el.text) !== null;
  return false;
}

const HARDWARE_PLATFORM = new Set(["windows", "macosx", "linux", "desktop", "hardware", "native"]);
const TOUCH_PLATFORM = new Set(["android", "ios", "mobile", "tablet", "phone", "touch", "web"]);

/** Truth of `platform('...')` in the hardware view and the touch view (rows 1.13, 3.19). */
export function platformTruth(text: string): { hardware: boolean; touch: boolean } {
  const tokens = text.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  const eval1 = (set: ReadonlySet<string>): boolean =>
    tokens.every((t) => (t.startsWith("!") ? !set.has(t.slice(1)) : set.has(t)));
  return { hardware: eval1(HARDWARE_PLATFORM), touch: eval1(TOUCH_PLATFORM) };
}

const BASELAYOUT_ALIASES: Record<string, readonly string[]> = {
  us: ["kbdus", "us"],
  "us-intl": ["kbdusx", "kbdinen", "us-intl", "usint"],
  azerty: ["kbdfr", "azerty", "fr"],
  qwertz: ["kbdgr", "qwertz", "de"],
  uk: ["kbduk", "uk", "gb"],
};

/** Truth of `baselayout('x')` against the export's base keyboard (row 3.20). */
export function baselayoutTruth(value: string, base: LdmlBaseLayout): boolean {
  const v = value.trim().toLowerCase();
  return (BASELAYOUT_ALIASES[base.id] ?? [base.id]).includes(v) || base.label.toLowerCase() === v;
}

function outputText(out: readonly OutputElement[]): string {
  let t = "";
  for (const el of out) if (el.kind === "char") t += el.value;
  return t;
}

/** Items of a store as literal strings; null items do not resolve to text (deadkey and raw). */
export function storeLiterals(store: IRStore): (string | null)[] {
  return store.items.map((it: StoreItem) => (it.kind === "char" ? it.value : null));
}

/** Count the transforms the cartesian expansion of the rule's index() references yields. */
export function expansionCount(
  rule: IRRule,
  group: IRGroup,
  keyOffset: number,
  out: readonly OutputElement[],
  ir: KeyboardIR,
): number {
  const offsets = new Set<number>();
  for (const el of out) if (el.kind === "index" && el.offset !== keyOffset) offsets.add(el.offset);
  let n = 1;
  for (const off of offsets) {
    const el = elementAtOffset(rule, group, off);
    if (el?.kind !== "any") continue;
    const s = findStore(ir, el.storeRef);
    n *= Math.max(1, s?.items.length ?? 1);
  }
  return n;
}

export function meetsSetMapping(
  rule: IRRule,
  group: IRGroup,
  keyOffset: number,
  out: readonly OutputElement[],
  ir: KeyboardIR,
): boolean {
  if (out.length !== 1) return false;
  const o = out[0];
  if (o?.kind !== "index" || o.offset === keyOffset) return false;
  const el = elementAtOffset(rule, group, o.offset);
  if (el?.kind !== "any") return false;
  const from = findStore(ir, el.storeRef);
  const to = findStore(ir, o.storeRef);
  if (!from || !to) return false;
  if (from.items.length === 0 || from.items.length !== to.items.length) return false;
  const lit = (s: IRStore): boolean => storeLiterals(s).every((x) => x !== null && x.length > 0);
  return lit(from) && lit(to);
}

export function analyseRule(
  env: RuleEnv,
  facts: GroupFacts,
  rule: IRRule,
  ordinal: number,
): RulePlan {
  const { ir, sink, rc } = env;
  const group = facts.group;
  const nodeKey = `group:${group.name}#${ordinal}`;
  const owner = `group ${group.name}${rule.ownedByPattern ? ` (${rule.ownedByPattern})` : rule.ownedByBehaviour ? ` (${rule.ownedByBehaviour})` : ""}`;
  const base = { nodeKey, line: rule.sourceLine, owner, isRule: true } as const;
  const split = splitRule(rule, group.usingKeys);

  const plan: RulePlan = {
    nodeKey,
    group,
    rule,
    ordinal,
    facts,
    lower: true,
    keystroke: split.keystroke,
    keyElement: split.keyElement,
    pre: split.pre,
    anchorStart: false,
    targets: [],
    suppress: null,
    hasContext: false,
    backspace: false,
    calls: [],
    setMapping: false,
  };
  const n = (rowId: RowId, extra: Partial<Parameters<ItemSink["add"]>[1]> = {}): void => {
    sink.add(rowId, { ...base, ...extra });
  };
  const reject = (rowId: RowId, extra: Partial<Parameters<ItemSink["add"]>[1]> = {}): RulePlan => {
    plan.lower = false;
    sink.add(rowId, { ...base, ...extra });
    return plan;
  };

  // --- Role of the group (rows 1.3, 1.4, 1.11) ---------------------------------------------------
  // Layer groups are evaluated as a whole (layerRules.ts), which reports their behaviours.
  if (facts.role === "newContext" || facts.role === "postKeystroke") {
    plan.lower = false;
    return plan;
  }
  if (facts.role === "unreachable") return reject("1.11");

  // --- match / nomatch (rows 1.8, 1.9, 3.21) -----------------------------------------------------
  if (ruleLhsKind(rule) !== "input") {
    const calls = ruleCalls(rule);
    plan.calls = calls;
    const only = rule.output.length === 1 ? rule.output[0] : undefined;
    if (only?.kind === "raw" && parseLayerCall(only.text) !== null) return reject("3.21");
    if (calls.length > 0 && rule.output.length === calls.length) {
      // An edge in the call graph, classified by the target's reach.
      const reaches = calls.map((c) => env.graph.facts.get(env.ir.groups.find((g) => g.name.toLowerCase() === c.toLowerCase()) as IRGroup));
      const partial = reaches.some((f) => f?.reach === "some");
      n("1.8", { status: partial ? "A" : "M", params: { group: group.name } });
      plan.lower = false;
      return plan;
    }
    return reject("1.9", { params: { group: group.name } });
  }

  // --- Keystroke (rows 2.x) -----------------------------------------------------------------------
  const ks = split.keystroke;
  // 1-based offset of the keystroke over `[...pre, keystroke]`, or -1 when there is none.
  const keyOffset = split.keyElement ? split.pre.length + 1 : -1;
  const mnemonic = rc.mnemonic;

  const keyRow = (v: string): RowId => {
    const u = v.toUpperCase();
    if (mnemonic) return "2.7";
    if (u === "K_OE2") return "2.2";
    if (u === "K_OC1" || u === "K_OE0" || u === "K_OE1") return "2.3";
    if (u === "K_SPACE") return "2.20";
    return "2.1";
  };

  const planModifiers = (mods: ReturnType<typeof analyseModifiers>, vkey: string): KeyTarget | null => {
    let m = mods;
    if (mods.unsupported.length > 0) {
      reject("2.22", { params: { modifiers: mods.unsupported.join(" ") } });
      return null;
    }
    if (mods.mixedSides) {
      if (env.sidedElsewhere) {
        reject("2.23", { status: "N", params: { vkey } });
        return null;
      }
      n("2.23", { status: "A", params: { vkey } });
      // Neutral form: re-derive the components with sides collapsed.
      const words: string[] = [];
      for (const c of mods.components) {
        if (c === "ctrlL" || c === "ctrlR") words.push("CTRL");
        else if (c === "altL" || c === "altR") words.push("ALT");
        else words.push(c.toUpperCase());
      }
      m = { ...analyseModifiers(words), caps: mods.caps };
    }
    if (m.rows.includes("2.12")) n("2.12", { params: { vkey } });
    if (m.components.includes("shift")) n("2.9");
    if (m.components.some((c) => c.startsWith("alt"))) n("2.10");
    if (m.components.some((c) => c.startsWith("ctrl"))) n("2.11");
    if (m.caps !== "any") n("2.13");
    else n("2.14");
    return { vkey, mods: m };
  };

  const addVKeyTarget = (vkey: string, mods: ReturnType<typeof analyseModifiers>, itemIndex: number | null, resolved = false): boolean => {
    const cls = classifyVKey(vkey);
    if (cls === "touch") {
      reject("2.21", { params: { vkey } });
      return false;
    }
    if (cls === "frame") {
      reject("2.5", { params: { vkey } });
      return false;
    }
    if (cls === "bksp") {
      const anyMods = mods.components.length > 0 || mods.caps !== "any" || mods.unsupported.length > 0;
      const ctxFree = split.pre.every(isGuardElement) && !split.pre.some((e) => e.kind === "raw" && isNulToken(e.text));
      if (anyMods) {
        reject("2.19", { params: { vkey } });
        return false;
      }
      if (ctxFree && split.pre.length === 0) {
        reject("2.24", { params: { vkey } });
        return false;
      }
      plan.backspace = true;
      n("2.18");
      plan.targets.push({ target: { vkey: "K_BKSP", mods }, itemIndex });
      return true;
    }
    const t = resolved ? { vkey: tableVKey(vkey), mods } : vkeyTarget(vkey, mods, rc);
    const planned = planModifiers(t.mods, t.vkey);
    if (planned === null) return false;
    if (!formHasKey(env.form, planned.vkey)) {
      reject("2.4", { params: { vkey: planned.vkey, form: env.form } });
      return false;
    }
    n(keyRow(planned.vkey), mnemonic ? { params: { vkey: planned.vkey } } : {});
    plan.targets.push({ target: planned, itemIndex });
    return true;
  };

  if (ks !== null) {
    if (ks.kind === "vkey" || ks.kind === "rawKey") {
      if (ks.kind === "rawKey" && ks.mods.unsupported.length > 0) {
        reject("2.22", { params: { modifiers: ks.mods.unsupported.join(" ") } });
        return plan;
      }
      if (!addVKeyTarget(ks.vkey, ks.mods, null)) return plan;
    } else if (ks.kind === "char") {
      const t = charTarget(ks.char, rc);
      if (t === null) return reject("6.2", { params: { reason: "unmapped-char-keystroke", char: ks.char } });
      if (!addVKeyTarget(t.vkey, t.mods, null, true)) return plan;
      n(mnemonic ? "2.7" : "2.6", { params: { char: ks.char } });
    } else if (ks.kind === "any") {
      const store = findStore(ir, ks.storeRef);
      const targets = storeKeyTargets(store, rc);
      const idxRefs = rule.output.filter((o): o is Extract<OutputElement, { kind: "index" }> => o.kind === "index" && o.offset === keyOffset);
      const bad = targets.length === 0 || targets.some((t) => t === null) ||
        idxRefs.some((o) => (findStore(ir, o.storeRef)?.items.length ?? -1) !== targets.length);
      if (bad) return reject("2.25", { status: "N", params: { store: ks.storeRef } });
      // Touch-only items (`T_*`, `U_*`) have no hardware position: they are dropped one by one
      // (row 2.21) and the hardware items of the same store are still exported.
      const hardware = targets.map((t, i) => ({ t, i })).filter((x) => x.t !== null && classifyVKey(x.t.vkey) !== "touch");
      if (hardware.length < targets.length) n("2.21", { params: { store: ks.storeRef } });
      if (hardware.length === 0) return reject("2.21", { params: { store: ks.storeRef } });
      const ok = hardware.every((x) => addVKeyTarget((x.t as KeyTarget).vkey, (x.t as KeyTarget).mods, x.i, true));
      if (!ok) return plan;
      n("2.25", { status: "M", params: { store: ks.storeRef } });
    } else {
      return reject("6.2", { params: { reason: "keystroke-element", element: ks.text } });
    }
  }

  // --- Context elements ---------------------------------------------------------------------------
  for (const el of split.pre) {
    switch (el.kind) {
      case "char":
        n("3.1");
        plan.hasContext = true;
        break;
      case "deadkey":
      case "namedDeadkey": {
        plan.hasContext = true;
        if (!env.deadkeysOutput.has(dkKey(el))) {
          return reject("3.4", { status: "N", params: { deadkey: el.kind === "deadkey" ? String(el.id) : el.name } });
        }
        n("3.1");
        break;
      }
      case "any": {
        plan.hasContext = true;
        const s = findStore(ir, el.storeRef);
        if (!s || s.items.length === 0 || s.items.some((i) => i.kind !== "char")) {
          return reject("3.26", { status: "N", params: { store: el.storeRef } });
        }
        n("3.6");
        break;
      }
      case "notany": {
        plan.hasContext = true;
        const s = findStore(ir, el.storeRef);
        const lits = s ? storeLiterals(s) : [null];
        if (lits.some((x) => x === null)) return reject("6.2", { params: { reason: "notany-store-items", store: el.storeRef } });
        const items = lits as string[];
        if (items.some((x) => [...x].length > 1)) return reject("3.11", { params: { store: el.storeRef } });
        if (items.some((x) => x.normalize("NFD") !== x)) return reject("3.10", { status: "N", params: { store: el.storeRef } });
        n("3.10", { status: "M", params: { store: el.storeRef } });
        break;
      }
      case "context":
      case "index":
        return reject("6.2", { params: { reason: `context-${el.kind}` } });
      case "if": {
        const s = findStore(ir, el.store.replace(/^&/, ""));
        const initial = s ? storeText(s) : "";
        n("3.17", { params: { option: el.store, default: initial, value: el.value } });
        if (initial !== el.value) plan.lower = false;
        break;
      }
      case "baselayout": {
        n("3.20", { params: { layout: el.value, base: env.baseLayout.id } });
        if (!baselayoutTruth(el.value, env.baseLayout)) plan.lower = false;
        break;
      }
      case "raw": {
        if (isNulToken(el.text)) {
          plan.anchorStart = true;
          n("3.24");
          break;
        }
        const plat = parsePlatformCall(el.text);
        if (plat !== null) {
          const t = platformTruth(plat);
          if (t.hardware !== t.touch) n("3.19", { status: "A", params: { platform: plat } });
          else n("3.19", { status: "M", params: { platform: plat } });
          if (!t.hardware) plan.lower = false;
          break;
        }
        return reject("6.2", { params: { reason: "context-raw", element: el.text } });
      }
      case "vkey":
        return reject("6.2", { params: { reason: "vkey-in-context" } });
      default:
        return assertNever(el, "context element");
    }
  }
  if (plan.pre.some((e) => e.kind === "any" || e.kind === "notany" || e.kind === "char" || e.kind === "deadkey" || e.kind === "namedDeadkey")) plan.hasContext = true;

  // --- Output elements ----------------------------------------------------------------------------
  const out = rule.output;
  const sole = out.length === 1 ? out[0] : undefined;
  if (sole?.kind === "nul" || sole?.kind === "beep") {
    plan.suppress = sole.kind;
    const ctxless = !plan.hasContext && !plan.anchorStart;
    n(sole.kind === "nul" ? (ctxless ? "3.15a" : "3.15b") : "3.16");
    if (sole.kind === "beep") n(ctxless ? "3.15a" : "3.15b");
    return finishNormalisation(plan, env, n);
  }
  let captures = 0;
  const capOffsets = new Set<number>();
  for (const el of out) {
    switch (el.kind) {
      case "char":
        n("3.1");
        break;
      case "deadkey":
      case "namedDeadkey":
        n("3.3");
        break;
      case "nul":
      case "beep":
        // Mixed with other output: the audible or empty part has nothing to carry; recorded as 3.16.
        if (el.kind === "beep") n("3.16");
        break;
      case "context":
        n("3.12");
        if (el.offset === 0) captures += 1;
        else capOffsets.add(el.offset);
        break;
      case "outs": {
        const s = findStore(ir, el.storeRef);
        if (!s || storeLiterals(s).some((x) => x === null)) {
          return reject("3.26", { status: "N", params: { store: el.storeRef } });
        }
        n("3.14");
        break;
      }
      case "index":
        break;
      case "useGroup":
        plan.calls.push(el.groupName);
        break;
      case "raw": {
        if (parseLayerCall(el.text) !== null) return reject("3.21");
        return reject("6.2", { params: { reason: "output-raw", element: el.text } });
      }
      default:
        return assertNever(el, "output element");
    }
  }
  captures += capOffsets.size;
  if (captures > MAX_CAPTURES) return reject("3.13", { status: "N", params: { count: String(captures) } });

  // index(): row 3.7 mapping, 3.8 cartesian, 3.9 over the cap.
  const idx = out.filter((o) => o.kind === "index");
  if (idx.length > 0) {
    for (const o of idx) {
      if (o.kind !== "index") continue;
      const el = elementAtOffset(rule, group, o.offset);
      if (el?.kind !== "any") return reject("6.2", { params: { reason: "index-target", offset: String(o.offset) } });
      const to = findStore(ir, o.storeRef);
      const lits = to ? storeLiterals(to) : [null];
      if (lits.some((x) => x === null)) return reject("3.26", { status: "N", params: { store: o.storeRef } });
    }
    if (meetsSetMapping(rule, group, keyOffset, out, ir)) {
      plan.setMapping = true;
      n("3.7");
    } else {
      const count = expansionCount(rule, group, keyOffset, out, ir) * Math.max(1, plan.targets.length);
      if (count > MAX_TRANSFORMS_PER_RULE) return reject("3.9", { status: "N", params: { count: String(count) } });
      n("3.8");
    }
  }
  if (plan.calls.length > 0) {
    for (const c of plan.calls) {
      const target = env.ir.groups.find((g) => g.name.toLowerCase() === c.toLowerCase());
      const tf = target ? env.graph.facts.get(target) : undefined;
      const row: RowId = target?.usingKeys ? "1.7" : tf?.reach === "every" ? "1.5" : "1.6";
      if (row === "1.5") n("1.5", { params: { group: c } });
      else n(row, { status: "A", params: { group: c } });
    }
  }
  return finishNormalisation(plan, env, n);
}

function finishNormalisation(plan: RulePlan, _env: RuleEnv, n: (r: RowId, e?: Partial<Parameters<ItemSink["add"]>[1]>) => void): RulePlan {
  const text = outputText(plan.rule.output);
  if (text !== text.normalize("NFC")) n("3.23", { params: { output: text } });
  return plan;
}

/** The first status a keystroke-free rule can have: a context-only rule is just text. */
export function ruleStatusOf(items: readonly { status: LdmlStatus }[]): LdmlStatus {
  return items.some((i) => i.status === "N") ? "N" : items.some((i) => i.status === "A") ? "A" : "M";
}
