// Layer B — mark-normalization uniformity (spec 046, FR-022).
//
// The uniformity invariant: a produced monolingual keyboard's mark-bearing
// output is EITHER uniformly in the ready-made single-character form OR
// uniformly in the base-plus-mark sequence form — never a mix. The marks
// series' output-form station PROPOSES the form; this check PROVES it against
// the finished keyboard's design (the design note's "the card proposes; the
// check proves").
//
// IR-aware, following the layer-a-prime.ts one-function-per-check convention
// (accepts inputs, returns LintFinding[], no I/O). Tagged layer "B" — the
// normalization form of emitted outputs is an IR property, not a lexical one.
// Wired into the SAME single-debounce validation run as every other check
// (validateWithOracle's TS task) — no second debounce, no parallel path.
//
// Criteria linkage: one layer-c-enforce criteria row carries
// lintRuleId "KM_LINT_MARK_NORMALIZATION_UNIFORM" (contracts criteria.json).

import type { KeyboardIR, LintFinding } from "@keyboard-studio/contracts";

export const MARK_NORMALIZATION_UNIFORM_CODE = "KM_LINT_MARK_NORMALIZATION_UNIFORM" as const;

// Deliberately the WIDE Unicode mark class (\p{M} = Mn+Mc+Me, matching
// codec/nfd-to-nfc.ts), not characterMap's isCombiningMarkChar (\p{Mn}\p{Mc}
// only) — enclosing marks (Me) count as mark-bearing output here too.
const COMBINING_MARK = /^\p{M}$/u;

function isCombining(ch: string): boolean {
  return COMBINING_MARK.test(ch);
}

interface FormEvidence {
  /** Occurrences of a precomposed mark-bearing character (NFD splits it). */
  composed: number;
  /** Occurrences of a base+combining-mark sequence left as a sequence. */
  decomposed: number;
  /** First source line carrying composed evidence, if known. */
  composedLine?: number;
  /** First source line carrying decomposed evidence, if known. */
  decomposedLine?: number;
}

/**
 * Classify one contiguous run of output characters: precomposed mark-bearing
 * characters (a single code point whose NFD is longer) count as ready-made
 * evidence; a base followed by combining marks counts as base-plus-mark
 * evidence — whether or not a ready-made form exists for it (a keyboard that
 * chose the ready-made form has, by construction, no never-composing pairs).
 */
function classifyRun(run: string, evidence: FormEvidence, sourceLine?: number): void {
  const units = [...run];
  for (let i = 0; i < units.length; i++) {
    const ch = units[i];
    if (ch === undefined) continue;
    if (isCombining(ch)) {
      // A combining mark following a non-mark starter = a decomposed sequence.
      const prev = units[i - 1];
      if (prev !== undefined && !isCombining(prev)) {
        evidence.decomposed++;
        if (evidence.decomposedLine === undefined && sourceLine !== undefined) {
          evidence.decomposedLine = sourceLine;
        }
      }
      continue;
    }
    if (ch.normalize("NFD").length > ch.length) {
      evidence.composed++;
      if (evidence.composedLine === undefined && sourceLine !== undefined) {
        evidence.composedLine = sourceLine;
      }
    }
  }
}

/**
 * FR-022: check that the keyboard's mark-bearing output is uniformly composed
 * or uniformly decomposed. Scans every rule's output char-runs plus every
 * non-system store's char items (stores feed outputs via `index()`/`outs()`).
 * Emits ONE aggregate finding when both forms are present; an all-one-form or
 * mark-free keyboard yields no findings.
 */
export function checkNormalizationUniformity(ir: KeyboardIR): LintFinding[] {
  const evidence: FormEvidence = { composed: 0, decomposed: 0 };

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      let run = "";
      const flush = (): void => {
        if (run.length > 0) classifyRun(run, evidence, rule.sourceLine);
        run = "";
      };
      for (const el of rule.output) {
        if (el.kind === "char") run += el.value;
        else flush();
      }
      flush();
    }
  }

  for (const store of ir.stores) {
    if (store.isSystem) continue;
    let run = "";
    const flush = (): void => {
      if (run.length > 0) classifyRun(run, evidence, store.sourceLine);
      run = "";
    };
    for (const item of store.items) {
      if (item.kind === "char") run += item.value;
      else flush();
    }
    flush();
  }

  if (evidence.composed === 0 || evidence.decomposed === 0) return [];

  const line = evidence.decomposedLine ?? evidence.composedLine;
  return [
    {
      code: MARK_NORMALIZATION_UNIFORM_CODE,
      severity: "warning",
      layer: "B",
      message:
        "Your keyboard builds accented letters two different ways — pick one and fix the rest.",
      hint:
        "Right now some accented letters (like é) come out as one ready-made character, " +
        "while others come out as a plain letter plus a separate accent mark stuck onto it. " +
        "Even though they look the same, that mix can break search, make backspace behave " +
        "oddly, and confuse other programs — so choose one way and update the few that " +
        "don't match.",
      ...(line !== undefined
        ? { location: { file: "", line, column: 1 } }
        : {}),
    },
  ];
}
