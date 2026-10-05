/**
 * touch-layout-conform — make a `.keyman-touch-layout` file acceptable to
 * Keyman Developer's strict loader before it leaves the studio.
 *
 * Keyman Developer validates this file against its JSON schema when it opens
 * it (`ETouchLayoutValidate`, error KM04000), and every object below the top
 * level declares `additionalProperties: false`. One unrecognised member
 * anywhere rejects the whole file. `kmc build` does not run that check, so a
 * file carrying an extra member compiles but will not load in the IDE.
 *
 * Two members this repo writes are outside the schema:
 *   - `output` on a key or sub-key. What a touch key types comes from the
 *     `.kmn` rules matched by key id, never from the layout, so dropping it
 *     changes nothing the keyboard does.
 *   - `p`, the per-key provenance tag (`PROVENANCE_WIRE_KEY`). It exists for
 *     the working copy's own re-propagation rule and has no meaning outside
 *     the studio; a reimported layout without it reads as `hand-set`, the
 *     conservative default.
 *
 * Rather than name those two, this strips every member the schema does not
 * allow, so a non-schema member carried in from an imported base cannot block
 * the IDE either. The allowlists below mirror
 * `common/schemas/keyman-touch-layout/keyman-touch-layout.spec.json` in
 * keymanapp/keyman (last changed upstream at 144456821b, 2024-02-23). The top
 * level is left alone: the schema does not close it.
 *
 * Applied only on the output projection (download and pull request), never to
 * the working copy or the preview, which still need `p`.
 */

import { TOUCH_LAYOUT_JSON_INDENT } from "./parse-touch.js";
import { FLICK_DIRECTIONS as CANONICAL_FLICK_DIRECTIONS } from "@keyboard-studio/contracts";

const PLATFORM_MEMBERS = new Set(["font", "fontsize", "layer", "displayUnderlying", "defaultHint"]);
const LAYER_MEMBERS = new Set(["id", "row"]);
const ROW_MEMBERS = new Set(["id", "key"]);
const KEY_MEMBERS = new Set([
  "id", "text", "layer", "nextlayer", "fontsize", "font", "dk", "sp", "pad", "width",
  "sk", "flick", "multitap", "hint",
]);
const SUBKEY_MEMBERS = new Set([
  "id", "text", "layer", "nextlayer", "sp", "pad", "width", "fontsize", "font", "dk", "default",
]);
const FLICK_DIRECTIONS = new Set<string>(CANONICAL_FLICK_DIRECTIONS);
const PLATFORM_IDS = new Set(["tablet", "phone", "desktop"]);

export interface ConformTouchLayoutResult {
  /** The conformed JSON; the input string unchanged when nothing was removed. */
  json: string;
  /** One `path.member` entry per removed member, e.g. `tablet.shift.K_Q.output`. */
  removed: string[];
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function prune(obj: Obj, allowed: ReadonlySet<string>, path: string, removed: string[]): void {
  for (const member of Object.keys(obj)) {
    if (!allowed.has(member)) {
      delete obj[member];
      removed.push(`${path}.${member}`);
    }
  }
}

function conformSubKeys(list: unknown, path: string, removed: string[]): void {
  if (!Array.isArray(list)) return;
  for (const sub of list) {
    if (isObj(sub)) prune(sub, SUBKEY_MEMBERS, `${path}.${String(sub["id"] ?? "?")}`, removed);
  }
}

function conformKey(key: Obj, path: string, removed: string[]): void {
  const keyPath = `${path}.${String(key["id"] ?? "?")}`;
  prune(key, KEY_MEMBERS, keyPath, removed);
  conformSubKeys(key["sk"], `${keyPath}.sk`, removed);
  conformSubKeys(key["multitap"], `${keyPath}.multitap`, removed);
  const flick = key["flick"];
  if (isObj(flick)) {
    prune(flick, FLICK_DIRECTIONS, `${keyPath}.flick`, removed);
    for (const [dir, sub] of Object.entries(flick)) {
      if (isObj(sub)) prune(sub, SUBKEY_MEMBERS, `${keyPath}.flick.${dir}`, removed);
    }
  }
}

/**
 * Strip every member Keyman's touch-layout schema does not allow. Input that
 * is not a JSON object is returned unchanged: this is a conformance pass, not
 * a validator, and a malformed file is Layer A's concern.
 */
export function conformTouchLayoutToKeymanSchema(json: string): ConformTouchLayoutResult {
  let layout: unknown;
  try {
    layout = JSON.parse(json);
  } catch {
    return { json, removed: [] };
  }
  if (!isObj(layout)) return { json, removed: [] };

  const removed: string[] = [];
  for (const [platformId, platform] of Object.entries(layout)) {
    if (!PLATFORM_IDS.has(platformId) || !isObj(platform)) continue;
    prune(platform, PLATFORM_MEMBERS, platformId, removed);
    const layers = platform["layer"];
    if (!Array.isArray(layers)) continue;
    for (const layer of layers) {
      if (!isObj(layer)) continue;
      const layerPath = `${platformId}.${String(layer["id"] ?? "?")}`;
      prune(layer, LAYER_MEMBERS, layerPath, removed);
      const rows = layer["row"];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!isObj(row)) continue;
        prune(row, ROW_MEMBERS, `${layerPath}.row${String(row["id"] ?? "?")}`, removed);
        const keys = row["key"];
        if (!Array.isArray(keys)) continue;
        for (const key of keys) {
          if (isObj(key)) conformKey(key, layerPath, removed);
        }
      }
    }
  }

  if (removed.length === 0) return { json, removed };
  return { json: JSON.stringify(layout, null, TOUCH_LAYOUT_JSON_INDENT), removed };
}
