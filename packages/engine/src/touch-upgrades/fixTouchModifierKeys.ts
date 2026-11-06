/**
 * Consistent Ctrl / RAlt touch keys (spec 111 T059b): a port of
 * `process_modifier_key` from the owner's `processTouch.py`.
 *
 * Ids become `K_RALT`, legacy labels (`ctrl`, `RALT`, `*Alt*`, `default`, ...)
 * become `*Ctrl*` / `*RAlt*`, `nextlayer` points at the Ctrl or RAlt layer (or
 * its shift/caps variant), and the key is the active special style (sp 2) on
 * the layer it opened. The per-key rule is `touchModifierKeyPatch` in
 * contracts, shared with the 18.17 check. Raw JSON in, raw JSON out: members
 * the fix does not concern are kept, and a layout with nothing to fix comes
 * back as the same string.
 */

import { touchModifierKeyPatch } from "@keyboard-studio/contracts";
import { TOUCH_LAYOUT_JSON_INDENT } from "../codec/parse-touch.js";

interface RawKey {
  id?: string;
  text?: string;
  sp?: string | number;
  nextlayer?: string | null;
  sk?: RawKey[];
  multitap?: RawKey[];
  [k: string]: unknown;
}
interface RawLayer {
  id?: string;
  row?: Array<{ key?: RawKey[]; [k: string]: unknown }>;
  [k: string]: unknown;
}

function patchKey(layerId: string, key: RawKey, ids: ReadonlySet<string>): boolean {
  let changed = false;
  const patch = touchModifierKeyPatch(layerId, key, ids);
  if (patch.id !== undefined) key.id = patch.id;
  if (patch.text !== undefined) key.text = patch.text;
  if (patch.sp !== undefined) key.sp = patch.sp;
  if (patch.nextlayer !== undefined) key.nextlayer = patch.nextlayer;
  if (Object.keys(patch).length > 0) changed = true;
  for (const sub of [...(key.sk ?? []), ...(key.multitap ?? [])]) {
    if (patchKey(layerId, sub, ids)) changed = true;
  }
  return changed;
}

export function fixTouchModifierKeysRaw(rawJson: string): { json: string; changed: boolean } {
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
    if (!Array.isArray(layers)) continue;
    const ids = new Set((layers as RawLayer[]).flatMap((l) => (typeof l.id === "string" ? [l.id] : [])));
    for (const layer of layers as RawLayer[]) {
      if (typeof layer.id !== "string") continue;
      for (const row of layer.row ?? []) {
        for (const key of row.key ?? []) {
          if (patchKey(layer.id, key, ids)) changed = true;
        }
      }
    }
  }
  if (!changed) return { json: rawJson, changed: false };
  return { json: JSON.stringify(layout, null, TOUCH_LAYOUT_JSON_INDENT), changed: true };
}
