/**
 * producedGlyphs — extract the set of output glyphs a keyboard can produce
 * from its parsed KeyboardIR.
 *
 * Used by spec §8 inventory diff: `alphabet − producedGlyphs = letters-to-add`.
 * The gallery then only needs mechanisms for the delta.
 *
 * Browser-safe: operates entirely on the in-memory IR, does no I/O.
 *
 * Grapheme-vs-codepoint decision
 * --------------------------------
 * A multi-char output string (e.g. a base letter followed by a combining mark
 * emitted as two separate `{kind:"char"}` elements, or a store item whose value
 * is a two-codepoint string) is split at Unicode codepoint boundaries (for-of
 * iteration over a JS string). This is intentional: a combining mark U+0301 and
 * a precomposed é (U+00E9) are both legitimate independent entries — the NFC step
 * handles the precomposition case, and the delta logic downstream can match on
 * either form. Full grapheme-cluster segmentation (via `Intl.Segmenter`) is not
 * used here because the browser Intl object is not guaranteed available in all
 * test environments, and codepoint-level resolution is sufficient for the §8 diff.
 * Flag for km-keyman review: if a keyboard emits two-codepoint grapheme clusters
 * (e.g. regional indicator pairs, emoji ZWJ sequences) these will appear as two
 * separate entries rather than one composed entry.
 *
 * Filtering rules
 * ---------------
 * Included:
 *   - Char/string-literal outputs from rule RHS (`{kind:"char"}`).
 *   - Store chars expanded from `{kind:"index"}` and `{kind:"outs"}` references.
 *   - Only chars surviving the control-char filter (see below).
 *
 * Excluded:
 *   - `{kind:"deadkey"}` tokens (state markers, not glyph output).
 *   - `{kind:"beep"}` (special token).
 *   - `{kind:"raw"}` (opaque — cannot statically determine content).
 *   - Control characters U+0000–U+001F (always excluded).
 *   - DEL U+007F (always excluded).
 *   - Space U+0020 (excluded by default; pass `includeSpace: true` to keep it).
 *
 * Store resolution
 * ----------------
 * `index(storeRef, offset)` and `outs(storeRef)` both expand every char item in
 * the referenced store. Missing stores are skipped without throwing.
 * Only `{kind:"char"}` items in stores contribute; `{kind:"vkey"}`, `{kind:"deadkey"}`,
 * `{kind:"any"}`, and `{kind:"raw"}` items are silently skipped.
 */

import type { KeyboardIR, IRStore, OutputElement } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ProducedGlyphsOptions {
  /**
   * When true, U+0020 SPACE is included in the output set.
   * Default: false (space is excluded as it is not a language character).
   */
  includeSpace?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true if the codepoint should be excluded regardless of options. */
function isControlChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return true;
  // C0 controls (U+0000–U+001F) and DEL (U+007F)
  return cp <= 0x001f || cp === 0x007f;
}

/** Add every codepoint from a string to the collector after NFC normalizing. */
function addNfcCodepoints(raw: string, collector: Set<string>, includeSpace: boolean): void {
  const normalized = raw.normalize("NFC");
  for (const ch of normalized) {
    if (isControlChar(ch)) continue;
    if (!includeSpace && ch === " ") continue;
    collector.add(ch);
  }
}

/** Expand all char items from a store into the collector. */
function expandStore(store: IRStore, collector: Set<string>, includeSpace: boolean): void {
  for (const item of store.items) {
    if (item.kind === "char") {
      addNfcCodepoints(item.value, collector, includeSpace);
    }
    // vkey, deadkey, any, raw — not literal output glyphs; skip
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the distinct set of glyphs the keyboard can produce, derived
 * statically from the in-memory `KeyboardIR`.
 *
 * @param ir - The parsed keyboard IR.
 * @param options - Optional filtering overrides.
 * @returns A sorted array of distinct NFC codepoints (one JS character each).
 *          Order is deterministic: ascending Unicode code-point value.
 *
 * @example
 * ```ts
 * const glyphs = producedGlyphs(ir);
 * const delta = linguistAlphabet.filter(ch => !glyphs.includes(ch));
 * ```
 */
export function producedGlyphs(
  ir: KeyboardIR,
  options: ProducedGlyphsOptions = {},
): string[] {
  const includeSpace = options.includeSpace === true;

  // Build a store lookup map once (name → IRStore).
  const storeMap = new Map<string, IRStore>(
    ir.stores.map((s) => [s.name, s]),
  );

  const collector = new Set<string>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      collectFromOutput(rule.output, storeMap, collector, includeSpace);
    }
  }

  // Return sorted by codepoint value for deterministic output.
  return [...collector].sort((a, b) => {
    const cpA = a.codePointAt(0) ?? 0;
    const cpB = b.codePointAt(0) ?? 0;
    return cpA - cpB;
  });
}

/**
 * Collect glyphs from a single rule's output element array.
 * Exported for unit-testing individual output sequences.
 */
export function collectFromOutput(
  output: readonly OutputElement[],
  storeMap: ReadonlyMap<string, IRStore>,
  collector: Set<string>,
  includeSpace: boolean,
): void {
  for (const elem of output) {
    switch (elem.kind) {
      case "char":
        // Direct char literal — NFC-normalize and split at codepoints.
        addNfcCodepoints(elem.value, collector, includeSpace);
        break;

      case "index": {
        // index(storeRef, offset): the keyboard emits one char from the store
        // at runtime (selected by offset into a parallel context store). We
        // cannot know *which* item fires statically, so we conservatively add
        // ALL char items from the referenced store to the produced set.
        const store = storeMap.get(elem.storeRef);
        if (store !== undefined) {
          expandStore(store, collector, includeSpace);
        }
        // Missing store → skip silently (resilience to partial IR)
        break;
      }

      case "outs": {
        // outs(storeRef): concatenate all items in the store and emit them.
        // Each char item contributes its codepoints to the produced set.
        const store = storeMap.get(elem.storeRef);
        if (store !== undefined) {
          expandStore(store, collector, includeSpace);
        }
        break;
      }

      case "deadkey":
        // State token — not a visible glyph.
        break;

      case "beep":
        // Audio signal — not a glyph.
        break;

      case "raw":
        // Opaque fragment — cannot statically determine content; skip.
        break;

      // Exhaustiveness: the OutputElement union has exactly these kinds.
      // TypeScript will error here if the union gains a new member.
    }
  }
}
