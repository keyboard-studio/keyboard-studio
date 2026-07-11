// Shared helpers for check-18-* (touch-layout / DISCUS) checks — internal to
// the checks directory.

import type { LintFinding, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";

/**
 * Build the `location` every check-18-* finding uses today: touch-layout
 * checks operate on the parsed IR, not on `.keyman-touch-layout` source text,
 * so there is no real line number to report — `line: 1` is the established
 * placeholder.
 *
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function makeLocation(touchLayoutPath: string): NonNullable<LintFinding["location"]> {
  return { file: touchLayoutPath, line: 1 };
}

type TouchPlatform = TouchLayoutIR["platforms"][number];
type TouchLayer = TouchPlatform["layers"][number];
type TouchRow = TouchLayer["rows"][number];

/** Per-key context yielded by {@link walkTouchKeys}. */
export interface TouchKeyContext {
  platform: TouchPlatform;
  layer: TouchLayer;
  row: TouchRow;
  rowIndex: number;
  key: TouchKeyIR;
  keyIndex: number;
}

/**
 * Walk every leaf key in a touch layout, in `platform → layer → row → key`
 * order (matching the checks' original nested-loop order exactly), invoking
 * `cb` once per key with its full positional context.
 *
 * Does not descend into a key's own `sk`/`multitap`/`flick` sub-keys — those
 * are a different traversal shape (recursive, not row/column positioned) and
 * are out of scope for this iterator.
 *
 * @param ir - Parsed touch layout.
 * @param cb - Invoked once per key with platform/layer/row/key context.
 */
export function walkTouchKeys(ir: TouchLayoutIR, cb: (ctx: TouchKeyContext) => void): void {
  for (const platform of ir.platforms) {
    for (const layer of platform.layers) {
      layer.rows.forEach((row, rowIndex) => {
        row.keys.forEach((key, keyIndex) => {
          cb({ platform, layer, row, rowIndex, key, keyIndex });
        });
      });
    }
  }
}
