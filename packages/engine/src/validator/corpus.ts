/**
 * D7 bounded-enumeration corpus generator (spec §14 D7, ratified at #232).
 *
 * Generates a finite set of KeyChord sequences (deadkey prefix up to depth 3
 * + final key) covering the modifier sets defined in D7. The corpus is used
 * by the I2 round-trip check stub and will be exercised by the Keyman Core
 * runtime in a future integration.
 *
 * Vkey source: codeMap.ts in this package holds only kmcmplib diagnostic
 * code aliases — it does NOT enumerate K_* virtual keys. Therefore the vkey
 * set is derived from the IR's own rules (only vkeys the keyboard actually
 * handles). This is conservative but correct for import-fidelity purposes:
 * we enumerate exactly the inputs the keyboard declares, not all possible
 * physical keys. The trade-off is that vkeys the keyboard emits via `use()`
 * chains from unrecognised groups may be missed; that limitation is
 * documented here and accepted for v1.
 */

import type { KeyboardIR, KeyChord } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// D7 modifier sets
// ---------------------------------------------------------------------------

/**
 * The six modifier sets from spec §14 D7.
 * Each entry is an ordered array of modifier name strings matching the
 * bracket-group syntax in .kmn (e.g. `[SHIFT K_A]`).
 */
export const D7_MODIFIER_SETS: string[][] = [
  [],
  ["SHIFT"],
  ["CTRL"],
  ["ALT"],
  ["SHIFT", "CTRL"],
  ["RALT"],
];

/** Maximum deadkey prefix chain depth per D7. */
export const D7_DEADKEY_DEPTH = 3;

// ---------------------------------------------------------------------------
// Corpus spec shape
// ---------------------------------------------------------------------------

export interface CorpusSpec {
  vkeyCount: number;
  modifierSets: string[][];
  deadkeyDepth: number;
}

export interface CorpusResult {
  corpus: KeyChord[][];
  corpusSpec: CorpusSpec;
  inputCount: number;
}

// ---------------------------------------------------------------------------
// Vkey extraction from IR
// ---------------------------------------------------------------------------

/**
 * Extract all unique vkey names referenced in the IR's rule contexts.
 *
 * This derives the vkey set from the keyboard's own declared rules — only
 * vkeys the keyboard explicitly handles appear in the corpus. See module
 * docstring for the accepted limitation with `use()` chain vkeys.
 */
function extractVkeysFromIR(ir: KeyboardIR): string[] {
  const seen = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "vkey") {
          seen.add(el.name);
        }
      }
    }
  }
  return Array.from(seen).sort();
}

// ---------------------------------------------------------------------------
// Corpus generation
// ---------------------------------------------------------------------------

/**
 * Generate the D7 bounded-enumeration corpus for a given IR.
 *
 * Each corpus entry is a KeyChord[] sequence: zero to `deadkeyDepth` deadkey
 * prefix chords followed by one final key chord. The deadkey prefixes use the
 * empty modifier set (unshifted) to keep the corpus size tractable.
 *
 * Corpus size formula:
 *   singleKeys = vkeyCount × modifierSetCount    (= vkeys × 6 modifier sets)
 *   sequences at depth d = vkeys^d × singleKeys
 *   total = sum over d=0..deadkeyDepth of (vkeys^d × singleKeys)
 *
 * Example with V=1 vkey × 6 modifier sets = 6 singleKeys:
 *   depth-0 (no prefix):   1^0 × 6 = 6
 *   depth-1 prefix:        1^1 × 6 = 6
 *   depth-2 prefix:        1^2 × 6 = 6
 *   depth-3 prefix:        1^3 × 6 = 6
 *   total = 24  (matches test vectors)
 *
 * Example with V=2 vkeys × 6 modifier sets = 12 singleKeys:
 *   depth-0: 2^0 × 12 = 12
 *   depth-1: 2^1 × 12 = 24
 *   depth-2: 2^2 × 12 = 48
 *   depth-3: 2^3 × 12 = 96
 *   total = 180  (matches test vectors)
 *
 * The generator is capped at MAX_CORPUS_SIZE entries; if the theoretical total
 * exceeds the cap, generation stops early and a console.info log is emitted.
 */

/** Hard cap to avoid allocating millions of arrays in the stub path. */
const MAX_CORPUS_SIZE = 100_000;

export function generateCorpus(ir: KeyboardIR): CorpusResult {
  const vkeys = extractVkeysFromIR(ir);
  const vkeyCount = vkeys.length;

  const corpusSpec: CorpusSpec = {
    vkeyCount,
    modifierSets: D7_MODIFIER_SETS,
    deadkeyDepth: D7_DEADKEY_DEPTH,
  };

  // Build the flat list of single-key chords (no prefix).
  const singleChords: KeyChord[] = [];
  for (const vkey of vkeys) {
    for (const modifiers of D7_MODIFIER_SETS) {
      singleChords.push({ vkey, modifiers });
    }
  }

  // If there are no vkeys we return an empty corpus.
  if (singleChords.length === 0) {
    return { corpus: [], corpusSpec, inputCount: 0 };
  }

  const corpus: KeyChord[][] = [];
  let truncated = false;

  // Helper: push an entry, returning false if the cap is reached.
  function pushEntry(entry: KeyChord[]): boolean {
    if (corpus.length >= MAX_CORPUS_SIZE) {
      truncated = true;
      return false;
    }
    corpus.push(entry);
    return true;
  }

  // Depth-0 prefix = no deadkey: just the single chords.
  for (const final of singleChords) {
    if (!pushEntry([final])) break;
  }

  // Depth 1..D7_DEADKEY_DEPTH: prepend deadkey chords (unshifted, to keep
  // the set tractable — the deadkey prefix uses modifier set []).
  const deadkeyChords: KeyChord[] = vkeys.map((vkey) => ({ vkey, modifiers: [] }));

  // Build sequences by iterating prefixes up to the max depth.
  // We use an iterative approach rather than recursion to avoid stack depth
  // issues on large vkey sets.
  let prefixBatch: KeyChord[][] = deadkeyChords.map((dk) => [dk]);

  outer: for (let depth = 1; depth <= D7_DEADKEY_DEPTH; depth++) {
    // Each prefix batch entry is combined with every final chord.
    for (const prefix of prefixBatch) {
      for (const final of singleChords) {
        if (!pushEntry([...prefix, final])) break outer;
      }
    }
    if (depth < D7_DEADKEY_DEPTH) {
      // Extend prefixes for the next depth level.
      const nextBatch: KeyChord[][] = [];
      for (const prefix of prefixBatch) {
        for (const dk of deadkeyChords) {
          nextBatch.push([...prefix, dk]);
        }
      }
      prefixBatch = nextBatch;
    }
  }

  // Compute the theoretical total for the truncation log.
  if (truncated) {
    let theoretical = 0;
    const s = singleChords.length;
    const v = vkeyCount;
    for (let d = 0; d <= D7_DEADKEY_DEPTH; d++) {
      theoretical += Math.pow(v, d) * s;
    }
    console.info(
      `[corpus] D7 corpus truncated at MAX_CORPUS_SIZE=${MAX_CORPUS_SIZE}; ` +
        `generated ${corpus.length} of theoretical ${theoretical} sequences.`,
    );
  }

  return { corpus, corpusSpec, inputCount: corpus.length };
}
