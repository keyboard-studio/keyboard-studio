/**
 * Per-keyboard §7.5.1 evaluation + corpus discovery (issue #297).
 *
 * Pipeline per keyboard (spec 007 §7.5.1): parse to IR → Layer A′ gate (only
 * keyboards whose import status is Clean / CleanWithOpaque run) → run the
 * pattern recognizer → derive the axis vector from the lifted patterns and
 * IR structure → run the §7.2 decision tree via the engine's
 * `selectStrategy` (reused, never reimplemented — the firing order lives in
 * the engine's rules tables) → compare the tree's pick against the dominant
 * `strategyId` among the recognized patterns.
 *
 * Agreement: the dominant recognized strategy is the tree's primary OR one
 * of its secondaries (the §7.5 hand table's own convention — `sil_yoruba8`
 * agrees because the tree wraps its pick in S-11). Anything else yields a
 * `StrategyDivergence` record with full provenance.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import type {
  KeyboardIR,
  StrategyDivergence,
  StrategyId,
} from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

import { parse } from "../../packages/engine/src/codec/index.js";
import { recognizePatterns } from "../../packages/engine/src/recognizer/index.js";
import { selectStrategy } from "../../packages/engine/src/strategy-selector/index.js";
import { deriveAxes } from "./axes.js";

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoveredKeyboard {
  /** Keyboard id — the `<id>` directory name under `release/<vendor>/`. */
  id: string;
  /** Absolute path of the primary `.kmn`. */
  kmnPath: string;
  /** Corpus-relative path (forward slashes), recorded on divergence records. */
  sourcePath: string;
}

/**
 * Enumerate keyboards under `<corpusRoot>/release/<vendor>/<id>/`. The
 * primary `.kmn` is `source/<id>.kmn` when present, else `<id>.kmn` at the
 * keyboard root, else the single `.kmn` under `source/`. Keyboards with no
 * `.kmn` (LDML / lexical-model packages) are out of scope — the round-trip
 * is defined over `.kmn` sources. Sorted by id for determinism.
 */
export function discoverKeyboards(corpusRoot: string, vendor?: string): DiscoveredKeyboard[] {
  const releaseDir = join(corpusRoot, "release");
  if (!existsSync(releaseDir)) return [];
  const vendors = vendor !== undefined ? [vendor] : readdirSync(releaseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const out: DiscoveredKeyboard[] = [];
  for (const v of vendors) {
    const vendorDir = join(releaseDir, v);
    if (!existsSync(vendorDir)) continue;
    for (const entry of readdirSync(vendorDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const dir = join(vendorDir, id);
      const candidates = [
        join(dir, "source", `${id}.kmn`),
        join(dir, `${id}.kmn`),
      ];
      let kmnPath = candidates.find((p) => existsSync(p));
      if (kmnPath === undefined) {
        const sourceDir = join(dir, "source");
        if (existsSync(sourceDir)) {
          const kmns = readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith(".kmn")).sort();
          if (kmns.length === 1) kmnPath = join(sourceDir, kmns[0]!);
        }
      }
      if (kmnPath === undefined) continue;
      out.push({
        id,
        kmnPath,
        sourcePath: relative(corpusRoot, kmnPath).replace(/\\/g, "/"),
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Recognized-strategy tally
// ---------------------------------------------------------------------------

/**
 * Owned-rule tally per recognized strategy — the same computation the
 * facet-index `strategy-tally` shares between its fingerprint and primary
 * classifiers (each recognized rule is owned by exactly one pattern, so
 * summing per-pattern owned-rule counts by strategy never double-counts).
 */
export function strategyRuleTally(ir: KeyboardIR): Map<StrategyId, number> {
  const counts = new Map<StrategyId, number>();
  for (const pattern of ir.recognizedPatterns) {
    if (pattern.strategyId === undefined) continue;
    const owned = (pattern.ownedNodes ?? []).filter((n) => n.kind === "rule").length;
    if (owned === 0) continue;
    counts.set(pattern.strategyId, (counts.get(pattern.strategyId) ?? 0) + owned);
  }
  return counts;
}

/** Arg-max of the tally; ties break to the lexicographically smallest id. */
export function dominantStrategy(tally: Map<StrategyId, number>): StrategyId | null {
  let best: StrategyId | null = null;
  let bestCount = -1;
  for (const id of [...tally.keys()].sort()) {
    const c = tally.get(id)!;
    if (c > bestCount) {
      best = id;
      bestCount = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type EvaluationOutcome =
  | { kind: "parse-failure"; keyboardId: string; sourcePath: string; errors: string[] }
  | { kind: "unevaluable"; keyboardId: string; sourcePath: string; reason: string }
  | {
      kind: "agreement" | "divergence";
      keyboardId: string;
      sourcePath: string;
      /** Present iff kind === "divergence". */
      divergence?: StrategyDivergence;
      /** Light per-keyboard summary, always present for evaluated keyboards. */
      summary: EvaluationSummary;
    };

export interface EvaluationSummary {
  keyboardId: string;
  importStatus: ImportStatus;
  treePrimary: StrategyId;
  triggeredRule: StrategyDivergence["triggeredRule"];
  recognizedPrimary: StrategyId;
  recognizedRatio: number;
  addedChars: number;
  dominantScript: string | null;
}

/**
 * Evaluate one keyboard's `.kmn` text. Never throws: a parse exception is a
 * `parse-failure` outcome (counted, never given a divergence record — the
 * §7.5.1 round-trip only runs over keyboards that pass Layer A′).
 */
export function evaluateKeyboard(
  keyboardId: string,
  kmnText: string,
  sourcePath: string,
): EvaluationOutcome {
  let ir: KeyboardIR;
  let recognizedRatio: number;
  try {
    const parsed = parse(kmnText, keyboardId);
    ir = parsed.ir;
    recognizedRatio = recognizePatterns(ir).recognizedRatio;
  } catch (err) {
    return {
      kind: "parse-failure",
      keyboardId,
      sourcePath,
      errors: [(err as Error).message],
    };
  }

  const importStatus =
    ir.raw.length > 0 ? ImportStatus.CleanWithOpaque : ImportStatus.Clean;

  const tally = strategyRuleTally(ir);
  const recognizedPrimary = dominantStrategy(tally);
  if (recognizedPrimary === null) {
    return {
      kind: "unevaluable",
      keyboardId,
      sourcePath,
      reason: "recognizer lifted no patterns (no dominant strategy to compare)",
    };
  }

  const derived = deriveAxes(ir);
  const recommendation = selectStrategy(derived.axes);

  const summary: EvaluationSummary = {
    keyboardId,
    importStatus,
    treePrimary: recommendation.primary,
    triggeredRule: recommendation.triggeredRule,
    recognizedPrimary,
    recognizedRatio,
    addedChars: derived.addedChars,
    dominantScript: derived.dominantScript,
  };

  const agrees =
    recognizedPrimary === recommendation.primary ||
    recommendation.secondaries.includes(recognizedPrimary);
  if (agrees) {
    return { kind: "agreement", keyboardId, sourcePath, summary };
  }

  const divergence: StrategyDivergence = {
    keyboardId,
    sourcePath,
    importStatus,
    axes: derived.axes,
    axisFills: derived.axisFills,
    treePrimary: recommendation.primary,
    treeSecondaries: recommendation.secondaries,
    triggeredRule: recommendation.triggeredRule,
    recognizedPrimary,
    recognizedTally: Object.fromEntries(tally),
    recognizedRatio,
  };
  return { kind: "divergence", keyboardId, sourcePath, divergence, summary };
}

/** Read + evaluate one discovered keyboard. */
export function evaluateDiscovered(kb: DiscoveredKeyboard): EvaluationOutcome {
  let text: string;
  try {
    text = readFileSync(kb.kmnPath, "utf8");
  } catch (err) {
    return {
      kind: "parse-failure",
      keyboardId: kb.id,
      sourcePath: kb.sourcePath,
      errors: [`cannot read source: ${(err as Error).message}`],
    };
  }
  return evaluateKeyboard(kb.id, text, kb.sourcePath);
}
