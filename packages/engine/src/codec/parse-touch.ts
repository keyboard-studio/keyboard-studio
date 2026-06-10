/**
 * .keyman-touch-layout JSON parser.
 *
 * The touch layout file is a JSON object with one or more platform keys
 * (desktop, tablet, phone). Each platform has a `layer` array of layer
 * objects. Each layer has a `row` array of rows. Each row has a `key` array.
 *
 * For v1 we merge all platform layers (desktop first, then tablet, then phone)
 * taking each layer only once (by `id`). Keys within each layer row are
 * recursively shaped into TouchKeyIR nodes, including the `sk` (subkey) array.
 */

import type { TouchLayoutIR, TouchKeyIR, IRNodeRef } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "./node-ids.js";

// ---------------------------------------------------------------------------
// Raw JSON shapes (non-exhaustive — only the fields we care about)
// ---------------------------------------------------------------------------

interface RawKey {
  id?: string;
  text?: string;
  output?: string;
  nextlayer?: string;
  sk?: RawKey[];
  multitap?: RawKey[];
  // other visual/positioning fields ignored
  [key: string]: unknown;
}

interface RawRow {
  id?: number;
  key?: RawKey[];
}

interface RawLayer {
  id?: string;
  row?: RawRow[];
}

interface RawPlatform {
  layer?: RawLayer[];
  displayUnderlying?: boolean;
}

type RawTouchLayout = Record<string, RawPlatform>;

// ---------------------------------------------------------------------------
// Key conversion
// ---------------------------------------------------------------------------

function convertKey(raw: RawKey, minter: NodeIdMinter): TouchKeyIR {
  const nodeId = minter.mint("touchKey");
  const key: TouchKeyIR = {
    nodeId,
    id: raw.id ?? "",
  };
  if (raw.text !== undefined) key.text = raw.text;
  if (raw.output !== undefined) key.output = raw.output;
  if (raw.nextlayer !== undefined) key.nextlayer = raw.nextlayer;
  if (Array.isArray(raw.sk) && raw.sk.length > 0) {
    key.sk = raw.sk.map(sk => convertKey(sk, minter));
  }
  // multitap keys are absorbed into sk for v1 (they share the same visual
  // mechanism). Log as raw-appended subkeys if present.
  if (Array.isArray(raw.multitap) && raw.multitap.length > 0) {
    const existingSk = key.sk ?? [];
    key.sk = [...existingSk, ...raw.multitap.map(mt => convertKey(mt, minter))];
  }
  return key;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a .keyman-touch-layout JSON string into a TouchLayoutIR.
 *
 * Platform priority: desktop > tablet > phone. Layers are merged with later
 * platforms filling in layer IDs not already present from earlier platforms.
 *
 * @throws SyntaxError if the input is not valid JSON.
 * @throws TypeError  if the JSON structure is clearly wrong (not an object).
 */
export function parseTouchLayout(json: string): TouchLayoutIR {
  const minter = new NodeIdMinter();

  const raw = JSON.parse(json) as unknown;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new TypeError("Touch layout JSON must be an object");
  }
  const layout = raw as RawTouchLayout;

  // Gather layers in platform priority order.
  const seenIds = new Set<string>();
  const mergedLayers: TouchLayoutIR["layers"] = [];
  const nodeIds: Array<[string, IRNodeRef]> = [];

  const PLATFORM_ORDER = ["desktop", "tablet", "phone"] as const;

  for (const platform of PLATFORM_ORDER) {
    const p = layout[platform];
    if (!p || !Array.isArray(p.layer)) continue;

    for (const rawLayer of p.layer) {
      const id = rawLayer.id ?? "default";
      if (seenIds.has(id)) continue; // already added from a higher-priority platform
      seenIds.add(id);

      const rows: TouchLayoutIR["layers"][number]["rows"] = [];

      for (const rawRow of rawLayer.row ?? []) {
        const keys: TouchKeyIR[] = [];
        for (const rawKey of rawRow.key ?? []) {
          const key = convertKey(rawKey, minter);
          keys.push(key);
          nodeIds.push([`${id}:${key.id}`, { kind: "touchKey", nodeId: key.nodeId }]);
          // Also record subkeys in nodeIds.
          if (key.sk) {
            for (const sk of key.sk) {
              nodeIds.push([`${id}:${key.id}:sk:${sk.id}`, { kind: "touchKey", nodeId: sk.nodeId }]);
            }
          }
        }
        rows.push({ keys });
      }

      mergedLayers.push({ id, rows });
    }
  }

  return { layers: mergedLayers, nodeIds };
}
