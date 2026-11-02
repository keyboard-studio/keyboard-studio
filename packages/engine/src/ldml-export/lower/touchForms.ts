// Touch forms (mapping rows 5.1-5.14; task T073).
//
// Each phone or tablet platform becomes one TR35 touch `<layers>` form. A touch key's output comes
// from the SAME key resolution as hardware (the hardware grid and trigger plan in triggers.ts,
// rules matched by key id and the layer's modifiers), never from the key's label (section 5
// preamble); `U_xxxx` maps to its code point and `T_*` keys to their context-free rule.
//
// Two steps keep key ids shared with the hardware form: `planTouchForms` resolves every key to a
// spec and lists the plain output keys that need ids; `buildTouchForms` is called after the one id
// pass in document.ts, gives keys that carry extra attributes (layerId, gestures, width) ids of their
// own, and writes the forms, key definitions and flicks.

import type { LDMLKeyboard } from "@keymanapp/developer-utils";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import type { LayerRules } from "../classify/layerRules.js";
import { touchLayerModifiers } from "../classify/layerRules.js";
import { classifyVKey, tableVKey } from "../classify/keystrokes.js";
import {
  TOUCH_SPECIAL_KEYS,
  buildTouchRuleIndex,
  gestureTargetIds,
  hasGesture,
  isLayerKey,
  touchKeyKind,
  unicodeKeyText,
  type TouchRuleIndex,
} from "../classify/touch.js";
import type { RulePlan } from "../classify/ruleElements.js";
import type { LdmlBaseLayout } from "../types.js";
import { baseCharFor, type Grid } from "./baseFill.js";
import { GAP_KEY_ID, layerKeyId, compareCodePoints } from "./keyIds.js";
import { cellKey, partsFromText, type Part, type TriggerPlan } from "./triggers.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";

/** `minDeviceWidth` of the phone form: the fallback for every device (row 5.1). */
export const PHONE_MIN_DEVICE_WIDTH = 1;
/** `minDeviceWidth` of the tablet form, in millimetres (row 5.2). */
export const TABLET_MIN_DEVICE_WIDTH = 150;

type Platform = TouchLayoutIR["platforms"][number];

const FLICK_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
type FlickDirection = (typeof FLICK_DIRECTIONS)[number];

/** A key that only types text and has no attribute of its own, so it shares the hardware key's id. */
interface SubSpec {
  parts: Part[];
  label: string | undefined;
}

type KeySpec =
  | { kind: "gap"; touchId: string; name: string | undefined; width: number | undefined }
  | {
      kind: "key";
      touchId: string;
      /** Typed text, or null for a layer-switch key with no output. */
      parts: Part[] | null;
      /** KMN layer name this key switches to after typing, or null. */
      layer: string | null;
      width: number | undefined;
      label: string | undefined;
      longPress: SubSpec[];
      longPressDefault: number;
      multiTap: SubSpec[];
      flick: Array<{ direction: FlickDirection; sub: SubSpec }>;
    };

interface RowSpec {
  /** Each item is a key, or the gap that a key's `pad` stands for. */
  keys: Array<{ pad: number | undefined; key: KeySpec }>;
}

interface LayerSpec {
  name: string;
  rows: RowSpec[];
}

interface FormSpec {
  platform: "phone" | "tablet";
  minDeviceWidth: number;
  layers: LayerSpec[];
}

export interface TouchPlan {
  forms: FormSpec[];
  /** Typed texts whose ids must come from the shared key-id pass. */
  plainParts: Part[][];
}

export interface TouchEnv {
  layout: TouchLayoutIR | null;
  grid: Grid;
  trig: TriggerPlan;
  plans: readonly RulePlan[];
  ir: KeyboardIR;
  baseLayout: LdmlBaseLayout;
  layerRules: LayerRules;
  cased: ReadonlySet<string>;
}

export interface TouchLowered {
  layers: LDMLKeyboard.LKLayers[];
  keys: Array<Record<string, string | number | boolean>>;
  flicks: LDMLKeyboard.LKFlick[];
  /** Where each touch key went: its form platform, layer and id in the layout, and its LDML layer and key id. */
  keyMap: Array<{ platform: "phone" | "tablet"; layer: string; key: string; ldmlLayer: string; ldmlKey: string }>;
  /** Labels to offer to the shared display set. */
  displays: Array<{ keyId: string; label: string; output: string }>;
}

/** Text typed by a part list, without markers. */
export function plainText(parts: readonly Part[]): string {
  return parts.map((p) => (p.t === "text" ? p.v : "")).join("");
}

export function ldmlWidth(percent: number | undefined): number | undefined {
  if (percent === undefined || !Number.isFinite(percent) || percent === 100) return undefined;
  const w = Number((percent / 100).toFixed(4));
  return Math.min(100, Math.max(0.01, w));
}

/**
 * The extra ISO key (`K_oE2`) has no position on the US form, but a touch layout may still name it:
 * Keyman types the US backslash there, so the touch key does too.
 */
function isoFallback(vkey: string, mods: { components: string[]; caps: boolean }): string | undefined {
  if (vkey !== "K_oE2" || mods.caps) return undefined;
  const key = mods.components.join(" ");
  return key === "" ? "\\" : key === "shift" ? "|" : undefined;
}

function resolveParts(env: TouchEnv, index: TouchRuleIndex, id: string, layerName: string): Part[] | null {
  const uni = unicodeKeyText(id);
  if (uni !== null) return [{ t: "text", v: uni }];
  const upper = id.toUpperCase();
  const mods = touchLayerModifiers(layerName);
  if (upper.startsWith("T_")) {
    const rule = (index.get(upper) ?? []).find(
      (r) =>
        r.mods.components.join(" ") === mods.components.join(" ") &&
        (r.mods.caps === "any" || (r.mods.caps === "on") === mods.caps),
    );
    return rule === undefined ? null : rule.text;
  }
  if (classifyVKey(id) !== "main") return null;
  const vkey = tableVKey(id);
  const layer = env.grid.layers.find((l) => l.caps === mods.caps && l.components.join(" ") === mods.components.join(" "));
  const cell = layer?.cells.find((c) => c.vkey === vkey);
  if (layer !== undefined && cell !== undefined) {
    const kind = env.trig.cells.get(cellKey(layer, vkey));
    if (kind === undefined || kind.kind === "gap") return null;
    return kind.kind === "text" ? kind.parts : [{ t: "marker", source: kind.source }];
  }
  const c = baseCharFor(env.baseLayout, mods.components, mods.caps, vkey, env.cased) ?? isoFallback(vkey, mods);
  return c === undefined || c === "deadkey" || c === "" ? null : [{ t: "text", v: c }];
}

/** A sub-key's spec, or null when it does not type text (it is dropped). */
function subSpec(env: TouchEnv, index: TouchRuleIndex, k: TouchKeyIR, layerName: string): SubSpec | null {
  const parts = resolveParts(env, index, k.id, k.layer ?? layerName);
  return parts === null ? null : { parts, label: k.text };
}

function formLayerIds(layers: readonly { id: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  const taken = new Set<string>();
  const hasDefault = layers.some((l) => l.id === "default");
  layers.forEach((l, i) => {
    let id = l.id === "default" || (!hasDefault && i === 0) ? "base" : l.id.replace(/[^A-Za-z0-9_-]/g, "_");
    if (id === "") id = "layer";
    let n = 2;
    const base = id;
    while (taken.has(id)) id = `${base}_${n++}`;
    taken.add(id);
    map.set(l.id, id);
  });
  return map;
}

function planPlatform(env: TouchEnv, index: TouchRuleIndex, p: Platform, plain: Part[][]): LayerSpec[] {
  const targets = gestureTargetIds(p);
  const offer = (s: SubSpec | null): SubSpec | null => {
    if (s !== null) plain.push(s.parts);
    return s;
  };
  return p.layers.map((layer) => ({
    name: layer.id,
    rows: layer.rows.map((row) => ({
      keys: row.keys.map((k): { pad: number | undefined; key: KeySpec } => {
        const pad = k.pad !== undefined && k.pad >= 1 ? k.pad : undefined;
        const width = ldmlWidth(k.width);
        const kind = touchKeyKind(k, index);
        if (kind === "spacer" || kind === "special") {
          const name = TOUCH_SPECIAL_KEYS[k.id];
          return { pad, key: { kind: "gap", touchId: k.id, name, width } };
        }
        const parts = kind === "key" ? resolveParts(env, index, k.id, k.layer ?? layer.id) : null;
        let next: string | null = null;
        if (isLayerKey(k)) next = k.nextlayer as string;
        else if (parts !== null) next = env.layerRules.next(layer.id, plainText(parts));
        if (next !== null && !p.layers.some((l) => l.id === next)) next = null;
        if (next === layer.id) next = null;
        if (parts === null && next === null) return { pad, key: { kind: "gap", touchId: k.id, name: undefined, width } };
        if (parts !== null) plain.push(parts);

        const key: KeySpec = {
          kind: "key",
          touchId: k.id,
          parts,
          layer: next,
          width,
          label: k.text,
          longPress: [],
          longPressDefault: -1,
          multiTap: [],
          flick: [],
        };
        // Gestures on a key that is itself a gesture target are ignored by TR35 (row 5.8): not written.
        if (!targets.has(k.id) && hasGesture(k)) {
          for (const s of k.sk ?? []) {
            const sub = offer(subSpec(env, index, s, layer.id));
            if (sub === null) continue;
            if (s.default === true && key.longPressDefault < 0) key.longPressDefault = key.longPress.length;
            key.longPress.push(sub);
          }
          for (const s of k.multitap ?? []) {
            const sub = offer(subSpec(env, index, s, layer.id));
            if (sub !== null) key.multiTap.push(sub);
          }
          for (const d of FLICK_DIRECTIONS) {
            const f = k.flick?.[d];
            if (f === undefined) continue;
            const sub = offer(subSpec(env, index, f, layer.id));
            if (sub !== null) key.flick.push({ direction: d, sub });
          }
        }
        return { pad, key };
      }),
    })),
  }));
}

export function planTouchForms(env: TouchEnv): TouchPlan {
  const plain: Part[][] = [];
  const forms: FormSpec[] = [];
  const index = buildTouchRuleIndex(env.plans, env.ir);
  const byId = new Map((env.layout?.platforms ?? []).map((p) => [p.id, p] as const));
  for (const [id, min] of [
    ["phone", PHONE_MIN_DEVICE_WIDTH],
    ["tablet", TABLET_MIN_DEVICE_WIDTH],
  ] as const) {
    const p = byId.get(id);
    if (p === undefined || p.layers.length === 0) continue;
    forms.push({ platform: id, minDeviceWidth: min, layers: planPlatform(env, index, p, plain) });
  }
  return { forms, plainParts: plain };
}

function numberToken(n: number): string {
  return String(n).replace(".", "_");
}

export interface BuildTouchEnv {
  /** Id of a plain output key, from the shared id pass. */
  idOf: (parts: readonly Part[]) => string;
  /** Every id already in use (the shared pass's result). */
  taken: ReadonlySet<string>;
  markerOf: (source: string) => string;
  /** The id proposal for a typed text (as in the hardware pass). */
  proposal: (parts: readonly Part[]) => string;
}

export function buildTouchForms(plan: TouchPlan, env: BuildTouchEnv): TouchLowered {
  const out = (parts: readonly Part[]): string => partsFromText(parts, env.markerOf, "output");
  const taken = new Set(env.taken);
  const defs = new Map<string, Record<string, string | number | boolean>>();
  const displays: TouchLowered["displays"] = [];
  const flicks = new Map<string, { id: string; segments: Array<{ directions: string; keyId: string }> }>();

  const defineText = (id: string, parts: readonly Part[], force: boolean): void => {
    if (defs.has(id)) return;
    const implied = !force && parts.length === 1 && parts[0]?.t === "text" && id === env.proposal(parts) && /^[A-Za-z0-9]$|^ $/.test(parts[0].v);
    if (!implied) defs.set(id, { id, output: out(parts) });
  };
  // A gesture target must be defined explicitly, even where its id is implied (TR35 resolves
  // gesture key ids against `<keys>`); a key typed directly on a layer need not be.
  const plainId = (s: SubSpec, target = false): string => {
    const id = env.idOf(s.parts);
    defineText(id, s.parts, target);
    if (s.label !== undefined) displays.push({ keyId: id, label: s.label, output: plainText(s.parts) });
    return id;
  };

  // Gap ids.
  const gapId = (name: string | undefined, width: number | undefined): string => {
    const base = name ?? GAP_KEY_ID;
    const id = width === undefined ? base : `${base}_w${numberToken(width)}`;
    if (name !== undefined || width !== undefined) {
      if (!defs.has(id)) {
        const d: Record<string, string | number | boolean> = { id, gap: true };
        if (width !== undefined) d["width"] = width;
        defs.set(id, d);
      }
    }
    return id;
  };

  // Keys with attributes of their own: sorted by signature so ids never depend on traversal order.
  interface AttrKey {
    sig: string;
    proposal: string;
    def: Record<string, string | number | boolean>;
    label: string | undefined;
    output: string;
  }
  const attrKeys = new Map<string, AttrKey>();
  const flickIdOf = (segments: Array<{ directions: string; keyId: string }>): string => {
    const sig = segments.map((s) => `${s.directions}:${s.keyId}`).join(",");
    let f = flicks.get(sig);
    if (f === undefined) {
      f = { id: "", segments };
      flicks.set(sig, f);
    }
    return sig;
  };

  const layerIdMaps = new Map<string, Map<string, string>>();
  for (const form of plan.forms) layerIdMaps.set(form.platform, formLayerIds(form.layers.map((l) => ({ id: l.name }))));

  // First pass: describe every key; the id of an attribute key is claimed after sorting.
  type Slot = ({ kind: "id"; id: string } | { kind: "attr"; sig: string }) & { touchId?: string };
  const slotsByForm = new Map<string, Slot[][][]>();
  const registerAttr = (form: FormSpec, k: Extract<KeySpec, { kind: "key" }>): Slot => {
    const lmap = layerIdMaps.get(form.platform) as Map<string, string>;
    const def: Record<string, string | number | boolean> = {};
    let proposal: string;
    let outputText = "";
    if (k.parts !== null) {
      def["output"] = out(k.parts);
      outputText = plainText(k.parts);
      proposal = env.proposal(k.parts);
    } else proposal = layerKeyId(k.layer ?? "");
    const lp = k.longPress.map((s) => plainId(s, true));
    const mt = k.multiTap.map((s) => plainId(s, true));
    if (lp.length > 0) {
      def["longPressKeyIds"] = lp.join(" ");
      if (k.longPressDefault >= 0) def["longPressDefaultKeyId"] = lp[k.longPressDefault] as string;
    }
    if (mt.length > 0) def["multiTapKeyIds"] = mt.join(" ");
    if (k.flick.length > 0) {
      const segs = k.flick.map((f) => ({ directions: f.direction, keyId: plainId(f.sub, true) }));
      def["flickId"] = flickIdOf(segs);
    }
    if (k.layer !== null) {
      const target = lmap.get(k.layer);
      if (target !== undefined) def["layerId"] = target;
    }
    if (k.width !== undefined) def["width"] = k.width;
    const plainOnly = Object.keys(def).every((x) => x === "output");
    if (k.parts !== null && plainOnly) {
      const id = plainId({ parts: k.parts, label: k.label });
      return { kind: "id", id };
    }
    if (k.parts === null && Object.keys(def).length === 0) return { kind: "id", id: gapId(undefined, undefined) };
    const sig = JSON.stringify(def);
    if (!attrKeys.has(sig)) attrKeys.set(sig, { sig, proposal, def, label: k.label, output: outputText });
    return { kind: "attr", sig };
  };

  for (const form of plan.forms) {
    const layers: Slot[][][] = form.layers.map((layer) =>
      layer.rows.map((row) => {
        const slots: Slot[] = [];
        for (const item of row.keys) {
          if (item.pad !== undefined) slots.push({ kind: "id", id: gapId(undefined, ldmlWidth(item.pad)) });
          const k = item.key;
          if (k.kind === "gap") slots.push({ kind: "id", id: gapId(k.name, k.width), touchId: k.touchId });
          else slots.push({ ...registerAttr(form, k), touchId: k.touchId });
        }
        return slots;
      }),
    );
    slotsByForm.set(form.platform, layers);
  }

  // Claim ids for attribute keys, in signature order.
  const attrId = new Map<string, string>();
  for (const ak of [...attrKeys.values()].sort((a, b) => compareCodePoints(a.sig, b.sig))) {
    let id = ak.proposal;
    let n = 2;
    while (taken.has(id) || defs.has(id)) id = `${ak.proposal}_${n++}`;
    taken.add(id);
    attrId.set(ak.sig, id);
    defs.set(id, { id, ...ak.def });
    if (ak.label !== undefined) displays.push({ keyId: id, label: ak.label, output: ak.output });
  }

  // Flick ids, in signature order.
  const flickList: LDMLKeyboard.LKFlick[] = [];
  [...flicks.entries()]
    .sort(([a], [b]) => compareCodePoints(a, b))
    .forEach(([, f], i) => {
      f.id = `flick_${i + 1}`;
      flickList.push({ id: f.id, flickSegment: f.segments } as unknown as LDMLKeyboard.LKFlick);
    });
  const flickIdFor = new Map([...flicks.entries()].map(([sig, f]) => [sig, f.id] as const));
  for (const d of defs.values()) {
    const sig = d["flickId"];
    if (typeof sig === "string") d["flickId"] = flickIdFor.get(sig) ?? sig;
  }

  const keyMap: TouchLowered["keyMap"] = [];
  const layers: LDMLKeyboard.LKLayers[] = plan.forms.map((form) => {
    const lmap = layerIdMaps.get(form.platform) as Map<string, string>;
    const slots = slotsByForm.get(form.platform) as Slot[][][];
    return {
      formId: "touch",
      minDeviceWidth: form.minDeviceWidth,
      layer: form.layers.map((layer, li) => ({
        id: lmap.get(layer.name),
        row: (slots[li] as Slot[][])
          .filter((r) => r.length > 0)
          .map((r) => ({
            keys: r
              .map((s) => {
                const id = s.kind === "id" ? s.id : (attrId.get(s.sig) as string);
                if (s.touchId !== undefined) {
                  keyMap.push({ platform: form.platform, layer: layer.name, key: s.touchId, ldmlLayer: lmap.get(layer.name) as string, ldmlKey: id });
                }
                return id;
              })
              .join(" "),
          })),
      })),
    } as unknown as LDMLKeyboard.LKLayers;
  });

  return {
    layers,
    keys: [...defs.values()],
    flicks: flickList,
    keyMap,
    displays,
  };
}
