/**
 * .keyman-touch-layout codec — emitter, plus a re-export of the canonical parser.
 *
 * The parser ({@link parseTouchLayout}) is the shared implementation in
 * `@keyboard-studio/contracts` (issue #354), so the engine codec and the
 * keyboard-lint package parse identically. The emitter is the codec's own
 * concern (lint never emits) and stays here as the inverse of that parser.
 */

import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";

/**
 * Parse a .keyman-touch-layout JSON string into a TouchLayoutIR.
 *
 * Thin alias over the canonical {@link parseTouchLayoutString} in contracts.
 *
 * @throws SyntaxError if the input is not valid JSON.
 * @throws TypeError  if the JSON structure is clearly wrong (not an object).
 */
export function parseTouchLayout(json: string): TouchLayoutIR {
  return parseTouchLayoutString(json);
}

// ---------------------------------------------------------------------------
// Emitter — inverse of parseTouchLayout
// ---------------------------------------------------------------------------

type EmittedKey = Record<string, unknown>;

function emitKey(key: TouchKeyIR): EmittedKey {
  const out: EmittedKey = { id: key.id };
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
