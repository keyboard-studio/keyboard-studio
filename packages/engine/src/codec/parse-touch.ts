/**
 * .keyman-touch-layout codec — emitter, plus a re-export of the canonical parser.
 *
 * The parser ({@link parseTouchLayout}) is the shared implementation in
 * `@keyboard-studio/contracts`, so the engine codec and the
 * keyboard-lint package parse identically. The emitter is the codec's own
 * concern (lint never emits) and stays here as the inverse of that parser.
 */

import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import {
  parseTouchLayoutString,
  PROVENANCE_WIRE_KEY,
  resolveWireEncoding,
} from "@keyboard-studio/contracts";

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

/**
 * Indent width every `.keyman-touch-layout` writer in this repo must use.
 *
 * Keyman Developer writes this file type as two-space-indented JSON with LF
 * newlines, raw (unescaped) UTF-8, insertion-order keys and no trailing
 * newline — i.e. exactly `JSON.stringify(value, null, 2)`. Confirmed by
 * round-tripping real shipped keyboards from the keyboards content repo
 * (`release/g/ghana`, `release/k/khmer_angkor`, `release/s/shan`,
 * `release/s/sundanese`): each file is byte-identical to
 * `JSON.stringify(JSON.parse(file), null, 2)`.
 *
 * Every writer of this file — the Case A emitter below and the Case B
 * raw-JSON appliers in `../pattern-apply/` — shares this constant so the two
 * output paths cannot drift, and so a hand-authored base keyboard keeps its
 * shape after we edit it.
 */
export const TOUCH_LAYOUT_JSON_INDENT = 2;

type EmittedKey = Record<string, unknown>;

function emitKey(key: TouchKeyIR): EmittedKey {
  const out: EmittedKey = { id: key.id };
  // Provenance round-trip (FR-010): write the tag to the non-standard `"p"`
  // wire property so it survives emit → re-parse. The Keyman Developer
  // touch-layout reader (kmc-kmn's TouchLayoutFileReader.read()) passes it
  // through on the build path; see the wire-key note in the canonical parser.
  //
  // #2083: the tag is written ONLY for a non-default provenance. A
  // `"hand-set"` tag (or an absent one, which parses as `hand-set` per FR-009)
  // re-parses to `hand-set` whether or not the wire property is present, so
  // omitting it is semantically lossless — and it stops the emitter from
  // materializing `"p": "hand-set"` onto every key whose source omitted it.
  if (key.provenance !== undefined && key.provenance !== "hand-set") {
    out[PROVENANCE_WIRE_KEY] = key.provenance;
  }
  if (key.text !== undefined) out["text"] = key.text;
  if (key.output !== undefined) out["output"] = key.output;
  if (key.hint !== undefined) out["hint"] = key.hint;
  // #2083: write back the SOURCE encoding (string vs number) instead of
  // re-encoding, so an unedited key round-trips byte-faithfully. The
  // encoding carries no semantics — every consumer reads the normalized
  // numeric value (the scaffolder's `nextlayer` defaulting included,
  // #2215). Synthesized keys (no wire hint) use the Keyman-canonical
  // string form.
  //
  // #2216: the hint is honoured only while it still denotes the current
  // numeric value (`resolveWireEncoding`). A mutator that changed the
  // numeric without clearing its hint must not silently resurrect the old
  // source value — the current value wins, in canonical string form.
  if (key.sp !== undefined) out["sp"] = resolveWireEncoding(key.spWire, key.sp);
  if (key.width !== undefined) out["width"] = resolveWireEncoding(key.widthWire, key.width);
  if (key.pad !== undefined) out["pad"] = resolveWireEncoding(key.padWire, key.pad);
  if (key.nextlayer !== undefined) out["nextlayer"] = key.nextlayer;
  // Per-key modifier override and longpress preselect (spec 063 FR-030). Both
  // are standard wire properties; `default` is emitted as a real JSON boolean,
  // not a string, matching the file format (unlike `sp`/`width`/`pad`).
  // `layer` and `layerAnnotation` carry the same wire `layer` value: the
  // editable spec-063 `layer` wins when present (so a key edit round-trips),
  // falling back to the engine's best-effort `layerAnnotation` for keys the
  // key editor never touched.
  if (key.layer !== undefined) out["layer"] = key.layer;
  else if (key.layerAnnotation !== undefined) out["layer"] = key.layerAnnotation;
  if (key.default !== undefined) out["default"] = key.default;
  // Per-key display fields (standard wire members the parser previously
  // dropped; #2083). Carried opaquely — written back verbatim.
  if (key.font !== undefined) out["font"] = key.font;
  if (key.fontsize !== undefined) out["fontsize"] = key.fontsize;
  if (key.dk !== undefined) out["dk"] = key.dk;
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
        // #2083: write back the source row id instead of regenerating it.
        // The 1-based fallback is for synthesized rows only (and matches what
        // the kmc-kmn TouchLayoutFileWriter fixup requires: row.id.toString()).
        id: r.id ?? rowIdx + 1,
        key: r.keys.map(emitKey),
      })),
    }));
    // #2083: platform-level display fields are preserved verbatim. Notably
    // `defaultHint` is NOT materialized here: a platform whose source omits it
    // emits without it (Keyman applies its own default), instead of gaining a
    // hard-written `"dot"`.
    const platformOut: Record<string, unknown> = { layer };
    if (platform.displayUnderlying !== undefined) {
      platformOut["displayUnderlying"] = platform.displayUnderlying;
    }
    if (platform.fontsize !== undefined) platformOut["fontsize"] = platform.fontsize;
    if (platform.defaultHint !== undefined) platformOut["defaultHint"] = platform.defaultHint;
    if (platform.font !== undefined) platformOut["font"] = platform.font;
    out[platform.id] = platformOut;
  }
  // Two-space indent, LF newlines, no trailing newline: byte-for-byte what
  // Keyman Developer itself writes. Verified against real shipped keyboards in
  // keyboard-studio/keyboards (release/g/ghana, release/k/khmer_angkor,
  // release/s/shan, release/s/sundanese) — each file is identical to
  // `JSON.stringify(JSON.parse(file), null, 2)`. Emitting compact JSON put the
  // whole layout on one line, which is valid JSON but unreadable and
  // undiffable next to every other keyboard in the corpus.
  return JSON.stringify(out, null, TOUCH_LAYOUT_JSON_INDENT);
}
