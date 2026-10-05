// Corpus mining harness (spec 085 T050, US5).
//
// Runs the import pipeline (real codec → IR + catalog metadata → module
// extractors) over a catalog sample and records per-decision variance.
// A decision no keyboard varies (zero variance across the sample) becomes
// a default with provenance — "nothing new under the sun": the default
// comes from observed data, not invention.
//
// This is the mechanism that completes the DecisionId vocabulary with data
// (plan §"Completing the vocabulary"): as the corpus grows, more decisions
// stabilize into defaults and fewer need to be asked.

import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId } from "./decisionTypes.ts";
import { buildExtractContext } from "./extractContext.ts";

/** One keyboard in the mining sample: the import pipeline's output. */
export interface CorpusSample {
  /** Keyboard id (e.g. "sil_cameroon_qwerty"). */
  id: string;
  /** IR from the real codec. */
  ir: KeyboardIR;
  /** Catalog metadata; null for non-catalog imports. */
  catalog: BaseKeyboard | null;
}

/** Per-decision variance observed across the sample. */
export interface DecisionVariance {
  id: DecisionId;
  /** Distinct extracted values (deep-compared). */
  distinctValues: unknown[];
  /** Keyboards that produced a value for this decision. */
  producers: number;
  /** Keyboards in the sample. */
  sampleSize: number;
  /** True when every producer extracted the same value. */
  isInvariant: boolean;
}

export interface MinedCorpus {
  variances: DecisionVariance[];
  /**
   * Invariant decisions as defaults. Each carries provenance "default" and
   * names the mining run as its source — the value was observed, not asked.
   */
  defaults: Array<Decision<unknown>>;
}

/** Deep-equality for extracted values (primitives, arrays, plain objects). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

/**
 * Mine a corpus sample for per-decision variance.
 *
 * For each keyboard, builds the ExtractContext and runs every module's
 * extract(). A throwing extractor is treated as "no value" for that
 * keyboard (the mining harness is observational, not validating).
 *
 * @param sample the keyboards to mine.
 * @param modules the question modules whose extractors run.
 * @param sourceLabel provenance source for defaults (e.g. "corpus-sample-2026-10").
 */
export function mineCorpus(
  sample: readonly CorpusSample[],
  modules: readonly QuestionModule[],
  sourceLabel: string,
): MinedCorpus {
  const valuesByDecision = new Map<DecisionId, unknown[]>();
  const producersByDecision = new Map<DecisionId, number>();

  for (const kb of sample) {
    const ctx = buildExtractContext(kb.ir, kb.catalog);
    for (const m of modules) {
      if (m.extract === undefined) continue;
      let extracted: unknown;
      try {
        extracted = m.extract(ctx);
      } catch {
        continue; // observational: a throwing extractor yields no value
      }
      if (extracted === undefined) continue;
      for (const id of m.provides ?? []) {
        const values = valuesByDecision.get(id) ?? [];
        values.push(extracted);
        valuesByDecision.set(id, values);
        producersByDecision.set(id, (producersByDecision.get(id) ?? 0) + 1);
      }
    }
  }

  const variances: DecisionVariance[] = [];
  const defaults: Array<Decision<unknown>> = [];

  for (const [id, values] of valuesByDecision) {
    const distinctValues: unknown[] = [];
    for (const v of values) {
      if (!distinctValues.some((d) => deepEqual(d, v))) {
        distinctValues.push(v);
      }
    }
    const producers = producersByDecision.get(id) ?? 0;
    const isInvariant = distinctValues.length <= 1;
    variances.push({
      id,
      distinctValues,
      producers,
      sampleSize: sample.length,
      isInvariant,
    });
    // Zero variance with at least one observation → a default with provenance.
    // No observations → nothing to default to (not invariant-meaningful).
    if (isInvariant && distinctValues.length === 1) {
      defaults.push({
        id,
        value: distinctValues[0],
        provenance: "default",
        source: sourceLabel,
      });
    }
  }

  // Decisions no module extracted for any keyboard: zero producers, no
  // variance entry (nothing observed). They stay undecided — the harness
  // reports only what the data supports.
  return { variances, defaults };
}
