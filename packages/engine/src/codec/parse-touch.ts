/**
 * .keyman-touch-layout JSON parser.
 *
 * The touch layout file is a JSON object with one or more platform keys
 * (desktop, tablet, phone). Each platform has a `layer` array of layer
 * objects. Each layer has a `row` array of rows. Each row has a `key` array.
 *
 * Each platform (desktop, tablet, phone) is a separate entry in the output IR.
 * Keys within each layer row are recursively shaped into TouchKeyIR nodes,
 * including the `sk` (subkey) array.
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
  font?: string;
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
 * Each platform (desktop, tablet, phone) is preserved as a separate entry in
 * `platforms`. Layer IDs within a platform are not deduplicated across platforms.
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

  const platforms: TouchLayoutIR["platforms"] = [];
  const nodeIds: Array<[string, IRNodeRef]> = [];

  const PLATFORM_ORDER = ["desktop", "tablet", "phone"] as const;

  for (const platform of PLATFORM_ORDER) {
    const p = layout[platform];
    if (!p || !Array.isArray(p.layer)) continue;

    const platformLayers: TouchLayoutIR["platforms"][number]["layers"] = [];

    for (const rawLayer of p.layer) {
      const id = rawLayer.id ?? "default";
      const rows: TouchLayoutIR["platforms"][number]["layers"][number]["rows"] = [];

      for (const rawRow of rawLayer.row ?? []) {
        const keys: TouchKeyIR[] = [];
        for (const rawKey of rawRow.key ?? []) {
          const key = convertKey(rawKey, minter);
          keys.push(key);
          nodeIds.push([`${platform}:${id}:${key.id}`, { kind: "touchKey", nodeId: key.nodeId }]);
          if (key.sk) {
            for (const sk of key.sk) {
              nodeIds.push([`${platform}:${id}:${key.id}:sk:${sk.id}`, { kind: "touchKey", nodeId: sk.nodeId }]);
            }
          }
        }
        rows.push({ keys });
      }

      platformLayers.push({ id, rows });
    }

    platforms.push({
      id: platform,
      ...(p.font !== undefined ? { font: p.font } : {}),
      layers: platformLayers,
    });
  }

  return { platforms, nodeIds };
}
