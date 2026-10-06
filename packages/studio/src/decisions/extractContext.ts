// Extraction context (spec 087, clarify Q1).
//
// `extract()` receives the whole import bundle: the parsed KeyboardIR plus
// the catalog entry. Language identity lives in catalog metadata (the codec
// leaves the IR header's bcp47 empty on real catalog imports); behavior,
// touch layout, and character inventory live in the IR. Each decision reads
// from whichever holds it.

import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";

/**
 * The import bundle every `extract()` probe reads (spec 087 Q1).
 *
 * `ir` is null when parsing failed — every extract then yields absent and
 * the author is asked. `catalog` is null for non-catalog imports.
 */
export interface ExtractContext {
  /** Parsed base keyboard. */
  ir: KeyboardIR | null;
  /**
   * Catalog entry: id, script, languages[], displayName, version.
   * Where language identity lives when the IR does not carry it.
   */
  catalog: BaseKeyboard | null;
}

/**
 * Build the bundle from the working-copy store's canonical slots
 * (`baseIr`, `baseKeyboard`) — no new store, no new fetch.
 */
export function buildExtractContext(
  baseIr: KeyboardIR | null,
  baseKeyboard: BaseKeyboard | null,
): ExtractContext {
  return { ir: baseIr, catalog: baseKeyboard };
}
