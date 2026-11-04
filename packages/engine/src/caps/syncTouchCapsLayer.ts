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
 * Only platforms that have a `default` layer with a cased letter are touched.
 * `rightalt-caps` is out of scope and never edited (R8).
 */

import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { caseCounterpart, isTouchFrameKey } from "@keyboard-studio/contracts";
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
    // Key absent from caps: add it at the default key's row and position.
    (def.row ?? []).some((row, ri) => {
      const ki = (row.key ?? []).findIndex((k) => k.id === id);
      const capsRow = caps.row?.[ri];
      if (ki < 0 || capsRow === undefined) return false;
      const source = (row.key ?? [])[ki] as RawKey;
      const fresh = JSON.parse(JSON.stringify(source)) as RawKey;
      fresh.text = upper;
      delete fresh.nextlayer;
      capsRow.key = capsRow.key ?? [];
      capsRow.key.splice(Math.min(ki, capsRow.key.length), 0, fresh);
      changed = true;
      return true;
    });
  }

  // 3. Character keys on the caps layer stay on it.
  for (const k of keysOf(caps)) {
    if (k.nextlayer === undefined || k.nextlayer === null) continue;
    if (isTouchFrameKey({ id: k.id ?? "", ...(k.text !== undefined ? { text: k.text } : {}) })) continue;
    delete k.nextlayer;
    changed = true;
  }

  // 4. Double-tap Shift on default reaches caps.
  const shiftKey = keysOf(def).find((k) => k.id === "K_SHIFT");
  if (shiftKey !== undefined && shiftKey.multitap?.some((m) => m["nextlayer"] === "caps") !== true) {
    shiftKey.multitap = [
      ...(shiftKey.multitap ?? []),
      { id: "T_CAPS", text: "*ShiftLock*", nextlayer: "caps" },
    ];
    changed = true;
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
  const layout = JSON.parse(rawJson) as Record<string, unknown>;
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
