/**
 * Touch caps-layer sync (spec 112, research R8).
 *
 * Makes a touch layout's Caps Lock behave like the desktop's: a `caps` layer
 * carrying the uppercase of every cased letter on `default`, reached by
 * double-tapping Shift, whose character keys do not switch layers. The raw
 * form patches the parsed JSON in place and re-serialises, so every member
 * outside the caps layer (and the default layer's `K_SHIFT` apart from its
 * multitap) is kept; the IR form wraps it so there is one implementation.
 *
 * It also carries the rest of the owner's Capsifesto touch behaviour
 * (`processTouch.py`): `rightalt-caps` and `ctrl-caps` built from their shift
 * layers and reached by double-tapping Shift on `rightalt` / `ctrl`, character
 * keys on other layers returning to `default` after one tap (one-shot Shift),
 * and Shift keys labelled `*Shifted*` / `*ShiftedLock*` returning to the
 * unshifted layer.
 *
 * Only platforms that have a `default` layer with a cased letter are touched.
 */

import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  caseCounterpart,
  isTouchCapsLayerId,
  isTouchFrameKey,
  isTouchOneShotKey,
  isTouchShiftLayerId,
  TOUCH_CAPS_FROM_SHIFT,
  touchDoubleTapTarget,
  unshiftedTouchLayerId,
} from "@keyboard-studio/contracts";
import { emitTouchLayout, parseTouchLayout, TOUCH_LAYOUT_JSON_INDENT } from "../codec/parse-touch.js";

interface RawKey {
  id?: string;
  text?: string;
  nextlayer?: string | null;
  multitap?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}
interface RawLayer {
  id: string;
  row?: Array<{ key?: RawKey[]; [k: string]: unknown }>;
  [k: string]: unknown;
}

const keysOf = (layer: RawLayer | undefined): RawKey[] =>
  (layer?.row ?? []).flatMap((r) => r.key ?? []);

function cloneLayer(layer: RawLayer, id: string): RawLayer {
  return { ...(JSON.parse(JSON.stringify(layer)) as RawLayer), id };
}

/** Patch one platform's layers; returns true when anything changed. */
function syncPlatform(layers: RawLayer[], bcp47: string | undefined): boolean {
  const def = layers.find((l) => l.id === "default");
  if (def === undefined) return false;
  const shift = layers.find((l) => l.id === "shift");
  const shiftKeys = keysOf(shift);

  const cased: Array<{ id: string; upper: string }> = [];
  for (const k of keysOf(def)) {
    if (k.id === undefined || k.text === undefined) continue;
    const c = caseCounterpart(k.text, bcp47);
    if (c === null || c.direction !== "toUpper") continue;
    const shiftText = shiftKeys.find((s) => s.id === k.id)?.text ?? "";
    // Shift giving something else (AZERTY digits) is the keyboard's own choice.
    if (shiftText === "" || shiftText === c.counterpart) cased.push({ id: k.id, upper: c.counterpart });
  }
  if (cased.length === 0) return false;

  let changed = false;

  // 1. Ensure a caps layer (shift's geometry, else default's).
  let caps = layers.find((l) => l.id === "caps");
  if (caps === undefined) {
    caps = cloneLayer(shift ?? def, "caps");
    layers.push(caps);
    changed = true;
  }
  // 2. Uppercase of each cased default letter.
  for (const { id, upper } of cased) {
    const target = keysOf(caps).find((k) => k.id === id);
    if (target !== undefined) {
      if (target.text !== upper) {
        target.text = upper;
        changed = true;
      }
      continue;
    }
    // Key absent from caps: add it at the default key's row and position,
    // creating the row when the caps layer has fewer rows than default.
    const rows = def.row ?? [];
    for (let ri = 0; ri < rows.length; ri++) {
      const defKeys = rows[ri]?.key ?? [];
      const ki = defKeys.findIndex((k) => k.id === id);
      if (ki < 0) continue;
      const fresh = JSON.parse(JSON.stringify(defKeys[ki])) as RawKey;
      fresh.text = upper;
      delete fresh.nextlayer;
      caps.row = caps.row ?? [];
      while (caps.row.length <= ri) caps.row.push({ key: [] });
      const capsRow = caps.row[ri] as { key?: RawKey[] };
      capsRow.key = capsRow.key ?? [];
      capsRow.key.splice(Math.min(ki, capsRow.key.length), 0, fresh);
      changed = true;
      break;
    }
  }

  // 3. rightalt-caps and ctrl-caps are copies of their shift layers.
  for (const [shiftId, capsId] of TOUCH_CAPS_FROM_SHIFT) {
    if (capsId === "caps") continue;
    const from = layers.find((l) => l.id === shiftId);
    if (from !== undefined && !layers.some((l) => l.id === capsId)) {
      layers.push(cloneLayer(from, capsId));
      changed = true;
    }
  }

  // 4. Character keys on a caps layer stay on it.
  const capsIds = new Set(TOUCH_CAPS_FROM_SHIFT.map(([, c]) => c));
  for (const layer of layers.filter((l) => capsIds.has(l.id))) {
    for (const k of keysOf(layer)) {
      if (k.nextlayer === undefined || k.nextlayer === null) continue;
      if (isTouchFrameKey({ id: k.id ?? "", ...(k.text !== undefined ? { text: k.text } : {}) })) continue;
      delete k.nextlayer;
      changed = true;
    }
  }

  // 5. Character keys on every other non-default layer return to default
  //    after one tap (one-shot Shift).
  for (const layer of layers) {
    if (layer.id === "default" || isTouchCapsLayerId(layer.id)) continue;
    for (const k of keysOf(layer)) {
      if (k.nextlayer !== undefined && k.nextlayer !== null) continue;
      if (!isTouchOneShotKey(k["sp"] as string | number | undefined)) continue;
      k.nextlayer = "default";
      changed = true;
    }
  }

  // 6. Double-tap Shift reaches the layer's caps layer.
  const ids = new Set(layers.map((l) => l.id));
  for (const layer of layers) {
    const target = touchDoubleTapTarget(layer.id, ids);
    if (target === undefined) continue;
    const shiftKey = keysOf(layer).find((k) => k.id === "K_SHIFT");
    if (shiftKey !== undefined && shiftKey.multitap?.some((m) => m["nextlayer"] === target) !== true) {
      shiftKey.multitap = [
        ...(shiftKey.multitap ?? []),
        { id: "T_CAPS", text: "*ShiftLock*", nextlayer: target },
      ];
      changed = true;
    }
  }

  // 7. Shift on a shift or caps layer is labelled and returns to the
  //    unshifted layer.
  for (const layer of layers) {
    const isShift = isTouchShiftLayerId(layer.id);
    if (!isShift && !isTouchCapsLayerId(layer.id)) continue;
    const back = unshiftedTouchLayerId(layer.id, ids);
    if (back === undefined) continue;
    const label = isShift ? "*Shifted*" : "*ShiftedLock*";
    for (const k of keysOf(layer)) {
      if (k.id !== "K_SHIFT") continue;
      if (k.text !== label) {
        k.text = label;
        changed = true;
      }
      if (k.nextlayer !== back) {
        k.nextlayer = back;
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Raw-JSON form. Returns the input string untouched when nothing changed, so
 * an already-complete layout is byte-identical.
 */
export function syncTouchCapsLayerRaw(
  rawJson: string,
  opts: { bcp47?: string },
): { json: string; changed: boolean } {
  let layout: Record<string, unknown>;
  try {
    layout = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return { json: rawJson, changed: false };
  }
  if (layout === null || typeof layout !== "object") return { json: rawJson, changed: false };
  let changed = false;
  for (const platform of Object.values(layout)) {
    const layers = (platform as { layer?: unknown } | null)?.layer;
    if (Array.isArray(layers) && syncPlatform(layers as RawLayer[], opts.bcp47)) changed = true;
  }
  if (!changed) return { json: rawJson, changed: false };
  return { json: JSON.stringify(layout, null, TOUCH_LAYOUT_JSON_INDENT), changed: true };
}

/** IR form: returns a synced copy; the input is not mutated. */
export function syncTouchCapsLayer(
  layout: TouchLayoutIR,
  opts: { bcp47?: string },
): { layout: TouchLayoutIR; changed: boolean } {
  const res = syncTouchCapsLayerRaw(emitTouchLayout(layout), opts);
  return res.changed ? { layout: parseTouchLayout(res.json), changed: true } : { layout, changed: false };
}
