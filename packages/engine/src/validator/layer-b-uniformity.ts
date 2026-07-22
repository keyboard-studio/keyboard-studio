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

// Standard Unicode convention for showing a combining mark in isolation:
// U+25CC DOTTED CIRCLE as the visible base. Used only in decomposed example
// rendering so it stays visually distinct from a composed precomposed char
// (without it, "e" + U+0301 and the precomposed "é" render identically).
const DOTTED_CIRCLE = "◌";

function isCombining(ch: string): boolean {
  return COMBINING_MARK.test(ch);
}

/** Cap on example characters collected per form (composed / decomposed). */
const MAX_EXAMPLES_PER_FORM = 3;

interface FormEvidence {
  /** Occurrences of a precomposed mark-bearing character (NFD splits it). */
  composed: number;
  /** Occurrences of a base+combining-mark sequence left as a sequence. */
  decomposed: number;
  /** First source line carrying composed evidence, if known. */
  composedLine?: number;
  /** First source line carrying decomposed evidence, if known. */
  decomposedLine?: number;
  /** First-seen, deduped precomposed characters, e.g. "é" — capped. */
  composedExamples: string[];
  /**
   * First-seen, deduped base+mark examples, rendered as base + U+25CC
   * (dotted circle) + the combining mark — e.g. "e" + U+0301 renders as
   * "e◌́" — so it stays visually distinct from a composed "é". Capped.
   */
  decomposedExamples: string[];
}

/** Push `value` onto `examples` if not already present and under the cap. */
function addExample(examples: string[], value: string): void {
  if (examples.length >= MAX_EXAMPLES_PER_FORM) return;
  if (examples.includes(value)) return;
  examples.push(value);
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
        addExample(evidence.decomposedExamples, prev + DOTTED_CIRCLE + ch);
      }
      continue;
    }
    if (ch.normalize("NFD").length > ch.length) {
      evidence.composed++;
      if (evidence.composedLine === undefined && sourceLine !== undefined) {
        evidence.composedLine = sourceLine;
      }
      addExample(evidence.composedExamples, ch);
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
  const evidence: FormEvidence = {
    composed: 0,
    decomposed: 0,
    composedExamples: [],
    decomposedExamples: [],
  };

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
  const examples = [...evidence.composedExamples, ...evidence.decomposedExamples];
  return [
    {
      code: MARK_NORMALIZATION_UNIFORM_CODE,
      severity: "warning",
      layer: "B",
      message:
        "Some letters with accents, like é, can be typed two different ways on your " +
        "keyboard. They look the same on screen, but the computer stores them differently " +
        "underneath. That means searching for text might not find it, and pressing " +
        "Backspace might delete more or less than you expect. Try to make your keyboard " +
        "type each letter the same way every time. For example: " +
        `${examples.join(", ")}.`,
      ...(line !== undefined
        ? { location: { file: "", line, column: 1 } }
        : {}),
    },
  ];
}
