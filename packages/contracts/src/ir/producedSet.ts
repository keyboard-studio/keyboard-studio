/**
 * buildProducedSet — canonical utility for extracting the set of glyphs a
 * keyboard can statically produce, derived from its KeyboardIR.
 *
 * This is the single shared implementation consumed by both the §8 inventory
 * diff (engine) and the §18.6 coverage check (keyboard-lint). Both packages
 * depend on @keyboard-studio/contracts; keyboard-lint cannot import engine.
 *
 * Run-merge fix
 * -------------
 * A keyboard that emits a base letter followed by a combining mark as two
 * consecutive {kind:"char"} elements (NFD/decomposed style, common in S-06/S-07
 * deadkey layouts) must produce the NFC-precomposed codepoint in the set — NOT
 * the two raw codepoints independently.
 *
 * Wrong (per-char NFC):  ["e","́"] → set contains "e" and U+0301
 * Correct (run-merge):   ["e","́"] → flush → "é".normalize("NFC") = "é"
 *                                          → set contains "é" (U+00E9)
 *
 * The fix: consecutive {kind:"char"} elements within a single rule output are
 * accumulated into a run buffer. When a non-char element or the end of the
 * output array is reached the buffer is flushed: joined and NFC-normalized, then
 * each resulting codepoint is added to the set individually.
 *
 * Store resolution
 * ----------------
 * index(storeRef, n) and outs(storeRef) both expand every char item in the
 * referenced store. Store items are treated individually (no cross-item run
 * merging — a store is a lookup table, not a linear output sequence).
 * Missing stores are skipped without throwing.
 *
 * Filtering
 * ---------
 * Excluded always:  deadkey, beep, raw elements; C0 controls U+0000–U+001F;
 *                   DEL U+007F.
 * Excluded by default: U+0020 SPACE. Pass `includeSpace: true` to retain it.
 *
 * Opaque fragments
 * ----------------
 * `ir.raw` fragments carrying a codec-extracted `producedOutput` sketch (the
 * output-side content of an opaque rule, e.g. one guarded by `if(...)`)
 * contribute through the same element walk — run-merge, store resolution, and
 * filtering all apply identically. Fragments without the field (non-rule
 * fragments, older parses) are skipped, preserving the prior behavior.
 *
 * Pure, browser-safe, no I/O.
 */

import type { KeyboardIR, IRStore, OutputElement } from "../keyboard-ir.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BuildProducedSetOptions {
  /**
   * When true, U+0020 SPACE is included in the output set.
   * Default: false (space is excluded as it is not a language character).
   */
  includeSpace?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true if the codepoint should always be excluded. */
function isExcluded(ch: string, includeSpace: boolean): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return true;
  // C0 controls (U+0000–U+001F) and DEL (U+007F)
  if (cp <= 0x001f || cp === 0x007f) return true;
  // Space excluded unless caller opts in
  if (!includeSpace && cp === 0x0020) return true;
  return false;
}

/**
 * Flush an accumulated run of consecutive char element values into the set.
 * Joins the run, NFC-normalizes, then adds each resulting codepoint.
 * Mutates `run` in place (clears it after flush).
 */
function flushRun(run: string[], collector: Set<string>, includeSpace: boolean): void {
  if (run.length === 0) return;
  const normalized = run.join("").normalize("NFC");
  for (const ch of normalized) {
    if (!isExcluded(ch, includeSpace)) {
      collector.add(ch);
    }
  }
  run.length = 0;
}

/** Expand all char items from a store into the collector (individual, no run-merge). */
function expandStore(store: IRStore, collector: Set<string>, includeSpace: boolean): void {
  for (const item of store.items) {
    if (item.kind === "char") {
      // Store items are individual entries (lookup table); NFC each one alone.
      const normalized = item.value.normalize("NFC");
      for (const ch of normalized) {
        if (!isExcluded(ch, includeSpace)) {
          collector.add(ch);
        }
      }
    }
    // vkey, deadkey, any, raw — not literal output glyphs; skip
  }
}

/**
 * Walk one output-element sequence (a typed rule's output or an opaque
 * fragment's producedOutput sketch), accumulating produced glyphs into the
 * collector with run-merge NFC semantics and store resolution.
 */
function collectFromElements(
  output: readonly OutputElement[],
  storeMap: Map<string, IRStore>,
  collector: Set<string>,
  includeSpace: boolean,
): void {
  const run: string[] = [];

  for (const elem of output) {
    switch (elem.kind) {
      case "char":
        // Accumulate into run buffer; do not flush yet.
        run.push(elem.value);
        break;

      case "index": {
        // Flush buffered run before expanding store.
        flushRun(run, collector, includeSpace);
        const store = storeMap.get(elem.storeRef);
        if (store !== undefined) {
          expandStore(store, collector, includeSpace);
        }
        // Missing store → skip silently (resilience to partial IR)
        break;
      }

      case "outs": {
        // Flush buffered run before expanding store.
        flushRun(run, collector, includeSpace);
        const store = storeMap.get(elem.storeRef);
        if (store !== undefined) {
          expandStore(store, collector, includeSpace);
        }
        break;
      }

      case "deadkey":
        // State token — not a visible glyph. Flush buffered run.
        flushRun(run, collector, includeSpace);
        break;

      case "beep":
        // Audio signal — not a glyph. Flush buffered run.
        flushRun(run, collector, includeSpace);
        break;

      case "useGroup":
        // Group transition — control flow, not a glyph. Flush buffered run.
        flushRun(run, collector, includeSpace);
        break;

      case "raw":
        // Opaque fragment — cannot statically determine content. Flush and skip.
        flushRun(run, collector, includeSpace);
        break;

      default: {
        // Exhaustiveness guard: TypeScript will error here if OutputElement
        // gains a new member kind that is not handled above.
        const _exhaustive: never = elem;
        flushRun(run, collector, includeSpace);
        void _exhaustive;
        break;
      }
    }
  }

  // End of output sequence: flush any trailing char run.
  flushRun(run, collector, includeSpace);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the set of NFC strings a single rule produces.
 *
 * Applies the same run-merge (NFD→NFC consecutive char accumulation) and
 * store-expansion (index()/outs()) logic that buildProducedSet uses across
 * the whole IR, but scoped to a single rule. Returns the raw NFC strings
 * (not individual codepoints), because the caller (collectCharContributors)
 * needs to compare whole-rule output against a target character.
 *
 * - Consecutive `{kind:"char"}` elements are accumulated, then NFC-joined on flush.
 * - `index(storeRef)` and `outs(storeRef)` expand every char item in the store
 *   individually (no cross-item run-merge — a store is a lookup table, not a
 *   linear output sequence). Each item's NFC value is returned as a separate string.
 * - `deadkey`, `beep`, `raw` flush any pending char run and contribute nothing.
 * - Missing stores are skipped without throwing (resilience to partial IR).
 * - The returned array may contain duplicates; dedup is the caller's responsibility.
 *
 * @param rule      - The IR rule to inspect.
 * @param storeMap  - Name-keyed map of all stores in the IR (pre-built for efficiency).
 * @returns Array of NFC strings this rule can produce (may be empty).
 */
export function ruleProducedStrings(
  rule: { output: { kind: string; value?: string; storeRef?: string }[] },
  storeMap: Map<string, IRStore>,
): string[] {
  const results: string[] = [];
  const run: string[] = [];

  const flushRunLocal = () => {
    if (run.length === 0) return;
    results.push(run.join("").normalize("NFC"));
    run.length = 0;
  };

  for (const elem of rule.output) {
    switch (elem.kind) {
      case "char":
        run.push((elem as { kind: "char"; value: string }).value);
        break;

      case "index":
      case "outs": {
        flushRunLocal();
        const storeRef = (elem as { kind: string; storeRef?: string }).storeRef;
        if (storeRef !== undefined) {
          const store = storeMap.get(storeRef);
          if (store !== undefined) {
            for (const item of store.items) {
              if (item.kind === "char") {
                results.push(item.value.normalize("NFC"));
              }
            }
          }
        }
        break;
      }

      case "deadkey":
      case "beep":
      case "raw":
        flushRunLocal();
        break;

      default:
        flushRunLocal();
        break;
    }
  }

  flushRunLocal();
  return results;
}

/**
 * Extract the distinct set of glyphs the keyboard can statically produce.
 *
 * Consecutive `{kind:"char"}` elements in a single rule output are accumulated
 * into a run buffer and flushed (joined then NFC-normalized) when a non-char
 * element or end-of-output is reached. This correctly handles keyboards that
 * emit base+combining pairs (NFD/decomposed style) as two consecutive char
 * elements — the resulting set contains the NFC-precomposed codepoint, not the
 * two raw codepoints independently.
 *
 * @param ir      - The parsed keyboard IR.
 * @param options - Optional filtering overrides.
 * @returns       A `Set<string>` of distinct NFC codepoints (one JS char each).
 *
 * @example
 * ```ts
 * const produced = buildProducedSet(ir);
 * const missing = alphabetChars.filter(ch => !produced.has(ch));
 * ```
 */
export function buildProducedSet(
  ir: KeyboardIR,
  options?: BuildProducedSetOptions,
): Set<string> {
  const includeSpace = options?.includeSpace === true;

  const storeMap = new Map<string, IRStore>(
    ir.stores.map((s) => [s.name, s]),
  );

  const collector = new Set<string>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      collectFromElements(rule.output, storeMap, collector, includeSpace);
    }
  }

  // Opaque fragments: fold in the codec-extracted output-side sketch, when
  // present. Store refs resolve against the same live store map, so a store
  // referenced only by an opaque rule still expands to its current items.
  for (const frag of ir.raw) {
    if (frag.producedOutput !== undefined) {
      collectFromElements(frag.producedOutput, storeMap, collector, includeSpace);
    }
  }

  return collector;
}
