// Touch layout classification (mapping rows 5.1-5.15; task T072).
//
// Every phone or tablet key gets an item (`nodeKey` `touch:<platform>/<layer>/<key>`). Presentation
// the export does not carry (fonts, hints, gestures on a gesture target, the desktop platform) is a
// hint, and the standard special keys are a hint too. The delivery fact (row 5.15) is added once by
// the classifier, not here.

import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { ruleParts, type Part } from "../lower/triggers.js";
import type { ItemSink } from "./items.js";
import { classifyVKey, type ModifierSet } from "./keystrokes.js";
import { findStore, isGuardElement, type RulePlan } from "./ruleElements.js";

type Platform = TouchLayoutIR["platforms"][number];

/** Key ids that LDML cannot express as keys (row 5.13): they become gap placeholders. */
export const TOUCH_SPECIAL_KEYS: Readonly<Record<string, string>> = {
  K_BKSP: "bksp",
  K_ENTER: "enter",
  K_TAB: "tab",
};

/** `sp` values for a blank key or a spacer (the key has no output and no id of its own). */
export function isSpacerKey(k: TouchKeyIR): boolean {
  return k.sp === 9 || k.sp === 10;
}

/** A key that switches layer (rows 5.4, 5.12). */
export function isLayerKey(k: TouchKeyIR): boolean {
  return k.nextlayer !== undefined && k.nextlayer !== "";
}

/** The ids every gesture (long-press, flick, multitap) points at. */
export function gestureTargetIds(p: Platform): Set<string> {
  const out = new Set<string>();
  for (const layer of p.layers) {
    for (const row of layer.rows) {
      for (const k of row.keys) {
        for (const s of k.sk ?? []) out.add(s.id);
        for (const s of k.multitap ?? []) out.add(s.id);
        for (const s of Object.values(k.flick ?? {})) if (s !== undefined) out.add(s.id);
      }
    }
  }
  return out;
}

export function hasGesture(k: TouchKeyIR): boolean {
  return (k.sk?.length ?? 0) > 0 || (k.multitap?.length ?? 0) > 0 || Object.keys(k.flick ?? {}).length > 0;
}

function presentation(k: TouchKeyIR): string[] {
  const out: string[] = [];
  const all = [k, ...(k.sk ?? []), ...(k.multitap ?? []), ...Object.values(k.flick ?? {}).filter((x): x is TouchKeyIR => x !== undefined)];
  const has = (name: string, pick: (x: TouchKeyIR) => unknown): void => {
    if (all.some((x) => pick(x) !== undefined && pick(x) !== "")) out.push(name);
  };
  has("font", (x) => x.font);
  has("fontsize", (x) => x.fontsize);
  has("hint", (x) => x.hint);
  has("dk", (x) => x.dk);
  return out;
}

/** A context-free rule on a `T_*` key whose output is plain text (row 5.14). */
export interface TouchRule {
  plan: RulePlan;
  mods: ModifierSet;
  text: Part[];
}

/** Upper-cased `T_*` vkey to its usable rules, in source order. */
export type TouchRuleIndex = ReadonlyMap<string, readonly TouchRule[]>;

export function buildTouchRuleIndex(plans: readonly RulePlan[], ir: KeyboardIR): TouchRuleIndex {
  const out = new Map<string, TouchRule[]>();
  for (const plan of plans) {
    const ks = plan.keystroke;
    if (plan.facts.role !== "main" || !plan.group.usingKeys || plan.rule.matchKind !== undefined) continue;
    if (ks === null || (ks.kind !== "vkey" && ks.kind !== "rawKey")) continue;
    const id = ks.vkey.toUpperCase();
    if (!id.startsWith("T_")) continue;
    if (plan.pre.some((el) => !isGuardElement(el))) continue;
    const text = ruleParts(plan.rule.output, null, (n) => findStore(ir, n));
    if (text.length === 0 || text.some((x) => x.t !== "text")) continue;
    const list = out.get(id) ?? [];
    list.push({ plan, mods: ks.mods, text });
    out.set(id, list);
  }
  for (const list of out.values()) list.sort((a, b) => (a.plan.rule.sourceLine ?? 0) - (b.plan.rule.sourceLine ?? 0));
  return out;
}

const UNICODE_ID = /^U_([0-9A-F]{4,6})((?:_[0-9A-F]{4,6})*)$/i;

/** `U_0061` or `U_0061_0301` to its text, or null when the id is not a code point id. */
export function unicodeKeyText(id: string): string | null {
  const m = UNICODE_ID.exec(id);
  if (m === null) return null;
  const hex = [m[1] as string, ...(m[2] ?? "").split("_").filter((x) => x !== "")];
  const cps = hex.map((h) => parseInt(h, 16));
  if (cps.some((cp) => cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))) return null;
  return String.fromCodePoint(...cps);
}

/** True when the key id resolves to typed text: a code point, a main-block key, or a `T_*` key with a rule. */
export function isTextKeyId(id: string, index: TouchRuleIndex): boolean {
  if (unicodeKeyText(id) !== null) return true;
  const upper = id.toUpperCase();
  if (upper.startsWith("T_")) return index.has(upper);
  return classifyVKey(id) === "main";
}

export type TouchKeyKind = "spacer" | "special" | "layer" | "key";

export function touchKeyKind(k: TouchKeyIR, index: TouchRuleIndex): TouchKeyKind {
  if (isSpacerKey(k)) return "spacer";
  if (TOUCH_SPECIAL_KEYS[k.id] !== undefined) return "special";
  if (isTextKeyId(k.id, index)) return "key";
  return isLayerKey(k) ? "layer" : "special";
}

export function classifyTouch(layout: TouchLayoutIR | null, sink: ItemSink, index: TouchRuleIndex): void {
  for (const p of layout?.platforms ?? []) {
    if (p.id === "desktop") {
      sink.add("5.3", { nodeKey: "touch:desktop/-/-", side: "touch", params: { platform: "desktop" } });
      continue;
    }
    const platformPresentation = [
      p.font !== undefined && p.font !== "" ? "font" : "",
      p.fontsize !== undefined && p.fontsize !== "" ? "fontsize" : "",
      p.defaultHint !== undefined && p.defaultHint !== "" ? "defaultHint" : "",
      p.displayUnderlying !== undefined ? "displayUnderlying" : "",
    ].filter((x) => x !== "");
    if (platformPresentation.length > 0) {
      sink.add("5.11", { nodeKey: `touch:${p.id}/-/-`, side: "touch", params: { platform: p.id, properties: platformPresentation.join(" ") } });
    }
    const targets = gestureTargetIds(p);
    for (const layer of p.layers) {
      for (const row of layer.rows) {
        for (const k of row.keys) {
          const nodeKey = `touch:${p.id}/${layer.id}/${k.id}`;
          const params = { platform: p.id, layer: layer.id, key: k.id };
          const o = { nodeKey, side: "touch" as const, params };
          const kind = touchKeyKind(k, index);
          if (kind === "spacer") sink.add("5.9", o);
          else if (kind === "special") sink.add("5.13", o);
          else if (kind === "layer") sink.add("5.12", o);
          else sink.add("5.14", o);
          if (targets.has(k.id) && hasGesture(k)) sink.add("5.8", o);
          const pres = presentation(k);
          if (pres.length > 0) sink.add("5.11", { ...o, params: { ...params, properties: pres.join(" ") } });
        }
      }
    }
  }
}
