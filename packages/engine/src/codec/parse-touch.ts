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

import type {
  TouchLayoutIR,
  TouchKeyIR,
  IRNodeRef,
  TouchKeyProvenance,
} from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../shared/node-ids.js";

// ---------------------------------------------------------------------------
// Provenance wire field (spec-014 US3 / T028, FR-010)
// ---------------------------------------------------------------------------
//
// Per-key touch provenance (TouchKeyIR.provenance) must survive the codec
// round-trip so the no-clobber re-propagation rule (US2) has a durable source.
// The `.keyman-touch-layout` JSON key object does NOT reserve a `"p"` property
// in the Keyman touch-layout schema, and kmcmplib's TouchLayoutFileReader
// ignores properties it does not recognise (RawKey carries `[key: string]:
// unknown`), so writing provenance under a short, non-colliding `"p"` key is a
// NON-BREAKING addition: the standard Keyman parser tolerates and skips it.
//
// `convertKey` reads `p` back, validating it against the known provenance
// vocabulary; an absent / legacy / out-of-vocabulary value defaults to
// `"hand-set"` (FR-009 — conservative, never auto-clobbered).

/** Wire-format property carrying per-key provenance in `.keyman-touch-layout`. */
const PROVENANCE_WIRE_KEY = "p" as const;

const PROVENANCE_VALUES: ReadonlySet<string> = new Set<TouchKeyProvenance>([
  "base-derived",
  "physical-suggested",
  "hand-set",
]);

/**
 * Coerce a raw wire value to a {@link TouchKeyProvenance}. Absent, legacy, or
 * out-of-vocabulary values default to `"hand-set"` (FR-009).
 */
function readProvenance(raw: unknown): TouchKeyProvenance {
  return typeof raw === "string" && PROVENANCE_VALUES.has(raw)
    ? (raw as TouchKeyProvenance)
    : "hand-set";
}

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
  /** Wire format encodes sp as a JSON string (e.g. `"sp": "1"`); also accept a number for robustness. */
  sp?: string | number;
  /** Wire format encodes width as a JSON string (e.g. `"width": "100"`); also accept a number for robustness. */
  width?: string | number;
  /** Wire format encodes pad as a JSON string (e.g. `"pad": "50"`); also accept a number for robustness. */
  pad?: string | number;
  hint?: string;
  /**
   * Per-key provenance (spec-014 FR-008/-010). Non-standard `.keyman-touch-layout`
   * property; ignored by kmcmplib's reader. Absent/legacy ⇒ `"hand-set"`.
   */
  p?: string;
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
    // Provenance is always materialised on deserialize: an absent/legacy/
    // out-of-vocabulary wire value resolves to the conservative `"hand-set"`
    // default (FR-009/T028), so the no-clobber rule always has a tag to read.
    provenance: readProvenance(raw[PROVENANCE_WIRE_KEY]),
  };
  if (raw.text !== undefined) key.text = raw.text;
  if (raw.output !== undefined) key.output = raw.output;
  if (raw.nextlayer !== undefined) key.nextlayer = raw.nextlayer;
  if (typeof raw.hint === "string" && raw.hint.length > 0) key.hint = raw.hint;
  if (raw.sp !== undefined && raw.sp !== "") {
    const spNum = typeof raw.sp === "number" ? raw.sp : Number(raw.sp);
    if (Number.isFinite(spNum)) key.sp = spNum;
  }
  if (raw.width !== undefined && raw.width !== "") {
    const widthNum = typeof raw.width === "number" ? raw.width : Number(raw.width);
    if (Number.isFinite(widthNum)) key.width = widthNum;
  }
  if (raw.pad !== undefined && raw.pad !== "") {
    const padNum = typeof raw.pad === "number" ? raw.pad : Number(raw.pad);
    if (Number.isFinite(padNum)) key.pad = padNum;
  }
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

// ---------------------------------------------------------------------------
// Emitter — inverse of parseTouchLayout
// ---------------------------------------------------------------------------

type EmittedKey = Record<string, unknown>;

function emitKey(key: TouchKeyIR): EmittedKey {
  const out: EmittedKey = { id: key.id };
  // Provenance round-trip (FR-010): write the tag to the non-standard `"p"`
  // wire property so it survives emit → re-parse. kmcmplib ignores it.
  if (key.provenance !== undefined) out[PROVENANCE_WIRE_KEY] = key.provenance;
  if (key.text !== undefined) out["text"] = key.text;
  if (key.output !== undefined) out["output"] = key.output;
  if (key.hint !== undefined) out["hint"] = key.hint;
  if (key.sp !== undefined) out["sp"] = String(key.sp);
  if (key.width !== undefined) out["width"] = String(key.width);
  if (key.pad !== undefined) out["pad"] = String(key.pad);
  if (key.nextlayer !== undefined) out["nextlayer"] = key.nextlayer;
  if (key.sk !== undefined && key.sk.length > 0) {
    out["sk"] = key.sk.map(emitKey);
  }
  if (key.flick !== undefined) {
    const flickOut: Record<string, unknown> = {};
    for (const [dir, fkey] of Object.entries(key.flick)) {
      if (fkey !== undefined) flickOut[dir] = emitKey(fkey);
    }
    out["flick"] = flickOut;
  }
  if (key.multitap !== undefined && key.multitap.length > 0) {
    out["multitap"] = key.multitap.map(emitKey);
  }
  return out;
}

/**
 * Emit a {@link TouchLayoutIR} as a `.keyman-touch-layout` JSON string.
 *
 * This is the inverse of {@link parseTouchLayout}: each platform entry is
 * written as a top-level key ("phone", "tablet", "desktop") with a `layer`
 * array. Keys use the file-format field names (`sp`/`width` as strings) so
 * kmcmplib can read the output directly.
 *
 * `nodeId` (an internal IR field) is never written to the file.
 */
export function emitTouchLayout(ir: TouchLayoutIR): string {
  const out: Record<string, unknown> = {};
  for (const platform of ir.platforms) {
    const layer = platform.layers.map((l) => ({
      id: l.id,
      row: l.rows.map((r, rowIdx) => ({
        // row.id is required by the kmc-kmn TouchLayoutFileWriter (fixup calls
        // row.id.toString()); emit 1-based numeric ids matching the Keyman schema.
        id: rowIdx + 1,
        key: r.keys.map(emitKey),
      })),
    }));
    const platformOut: Record<string, unknown> = {
      layer,
      // defaultHint is required on TouchLayoutPlatform per the vendor type.
      // "dot" causes the Keyman runtime to render a generic dot (•) hint on any
      // key that has longpress sub-keys (sk), rather than showing the first
      // sub-key character. Per-key explicit `hint` fields still override this.
      defaultHint: "dot",
    };
    if (platform.font !== undefined) platformOut["font"] = platform.font;
    out[platform.id] = platformOut;
  }
  return JSON.stringify(out);
}
