/**
 * Axis extractor — derive a §7.1 discovery axis vector from a corpus
 * keyboard's parsed + recognized KeyboardIR (spec 007 §7.5.1, issue #297).
 *
 * The survey elicits these axes from a human; the corpus pass has no human,
 * so every axis is either DERIVED from IR structure / lifted patterns (the
 * axes the issue enumerates: A1 from new-character count, A2 from script,
 * A4 from lifted deadkey/cycle families, A7/A7a from key-coverage shape)
 * or left for the script-class prior (`defaultFillAxes`, §7.2) — never
 * invented. Derived values are passed to the prior as the partial vector,
 * so a derived value always wins over the prior's unmarked default, and the
 * returned `axisFills` record exactly which axes the prior had to assume.
 *
 * Heuristics are named as heuristics in each axis's comment and echoed into
 * the per-axis `evidence` strings the divergence report carries, so a triage
 * reader can see the measurement behind every value.
 */

import type {
  DiscoveryAxisVector,
  KeyboardIR,
  Scale,
  ScriptClass,
} from "@keyboard-studio/contracts";
import {
  buildProducedSet,
  keyBudgetToSpareKeyAvailability,
  measureKeyBudget,
  STOCK_BASE_LAYOUTS,
  DEFAULT_BASELAYOUT,
} from "@keyboard-studio/contracts";

import { getCCC } from "@keyboard-studio/contracts/unicode";
import { scriptOf, scriptExtensionsOf } from "../../packages/engine/src/facets/generated/scriptLookup.js";
import { detectMarkInputOrderFromImport } from "../../packages/engine/src/strategy-selector/import-mark-order.js";
import { defaultFillAxes } from "../../packages/engine/src/strategy-selector/default-fill.js";
import { isMnemonicLayout } from "../../packages/engine/src/pattern-apply/shiftRules.js";
import type { AxisFill } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// A1 — scale from new-character count
// ---------------------------------------------------------------------------

/**
 * Contiguous A1 band for an added-character count. Boundaries follow §7.1
 * (tiny <5 / small 5–20 / medium 20–100 / large 100–300 / massive 1000+);
 * the §7.1 hints leave a gap between large's top (300) and massive (1000+),
 * closed the same way the facet-index added-char-count classifier closes it:
 * bands are contiguous at 300, so every count ≥ 300 reads `massive`.
 */
export function a1Band(count: number): Scale {
  if (count < 5) return "tiny";
  if (count < 20) return "small";
  if (count < 100) return "medium";
  if (count < 300) return "large";
  return "massive";
}

/** The stock physical-layout char set (pinned `kbdus` values). */
function stockChars(): Set<string> {
  return new Set(Object.values(STOCK_BASE_LAYOUTS[DEFAULT_BASELAYOUT] ?? {}));
}

/**
 * New characters = produced codepoints a stock US layout does not already
 * produce (the §7.1 A1 question: "ones not already on a standard physical
 * keyboard"). Counted over codepoints, not grapheme strings.
 */
export function addedCharCount(ir: KeyboardIR): number {
  const stock = stockChars();
  let count = 0;
  for (const ch of buildProducedSet(ir)) {
    if (!stock.has(ch)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// A2 — script class from the dominant produced script
// ---------------------------------------------------------------------------

// ISO 15924 → §7.1 script class. The explicit sets mirror the studio's
// scriptAxes classification (packages/studio/src/lib/scriptAxes.ts); a
// script in none of the sets defaults to "alphabetic", the same fall-through
// the studio documents. Kept as data here because the corpus tool cannot
// import studio code; the two tables are the same classification decision.
const ABUGIDA = new Set([
  "Deva", "Beng", "Taml", "Telu", "Knda", "Mlym", "Guru", "Gujr",
  "Orya", "Sinh", "Thai", "Khmr", "Mymr", "Laoo", "Tibt",
]);
const ABJAD = new Set(["Arab", "Hebr", "Syrc", "Nkoo", "Mand", "Samr"]);
const SYLLABARY = new Set(["Cans", "Vaii", "Cher", "Yiii"]);
const LOGOGRAPHIC = new Set(["Hani"]);

export function scriptClassOfScript(script: string): ScriptClass {
  if (ABUGIDA.has(script)) return "abugida";
  if (ABJAD.has(script)) return "abjad";
  if (SYLLABARY.has(script)) return "syllabary";
  if (LOGOGRAPHIC.has(script)) return "logographic";
  return "alphabetic";
}

const NEUTRAL_SCRIPTS = new Set(["Zyyy", "Zinh", "Zzzz", "Zxxx"]);

/**
 * Dominant ISO 15924 script of the produced set, attestation-style (the
 * engine `attestedScripts` composition): only exclusive-Script characters
 * count — a character carrying a Script_Extensions set is shared evidence
 * and is skipped, as are Common/Inherited/Unknown codepoints. Falls back to
 * tallying shared characters when a keyboard produces no exclusive ones.
 * Ties break to the lexicographically smallest script code (determinism).
 * Returns null when the produced set carries no script evidence at all.
 */
export function dominantScript(ir: KeyboardIR): string | null {
  const tally = new Map<string, number>();
  const tallyShared = new Map<string, number>();
  for (const ch of buildProducedSet(ir)) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const script = scriptOf(cp);
    if (NEUTRAL_SCRIPTS.has(script)) continue;
    if (scriptExtensionsOf(cp) !== undefined) {
      tallyShared.set(script, (tallyShared.get(script) ?? 0) + 1);
    } else {
      tally.set(script, (tally.get(script) ?? 0) + 1);
    }
  }
  const source = tally.size > 0 ? tally : tallyShared;
  let best: string | null = null;
  let bestCount = -1;
  for (const script of [...source.keys()].sort()) {
    const c = source.get(script)!;
    if (c > bestCount) {
      best = script;
      bestCount = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// A4 — diacritic behavior from deadkey / cycle families
// ---------------------------------------------------------------------------

/** Identity of one deadkey: numeric id or named reference. */
function deadkeyKey(kind: string, id: number | undefined, name: string | undefined): string {
  return kind === "namedDeadkey" ? `named:${name}` : `dk:${id}`;
}

/** Distinct deadkeys consumed as mark triggers anywhere in the IR's rules. */
export function deadkeyFamilies(ir: KeyboardIR): Set<string> {
  const families = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "deadkey") families.add(deadkeyKey("deadkey", el.id, undefined));
        else if (el.kind === "namedDeadkey") families.add(deadkeyKey("namedDeadkey", undefined, el.name));
      }
    }
  }
  return families;
}

/**
 * Replacing-cycling shape (heuristic): some rule's struck key, pressed
 * immediately after a character that the SAME key (same modifiers) produced
 * without deadkey help, produces a different character — "press the mark
 * key again to replace the mark" (Vietnamese-tone-key style). All four
 * conditions are required, to keep ordinary context rules (tie bars,
 * vowel harmony, deadkey composition) from tripping it:
 *   1. the consumed character is the context element immediately before
 *      the struck key (it is the character being replaced);
 *   2. that character is non-ASCII (a produced mark, not a base letter);
 *   3. the same key+modifiers produce it in a rule with no deadkey in
 *      context (it got there by this key, not by composition);
 *   4. neither rule involves a deadkey — deadkey re-application is the
 *      stacking shape, counted by families instead;
 *   5. both the replaced character and this rule's produced character are
 *      precomposed marked LETTERS — single codepoints whose NFD
 *      decomposition is a base letter plus a combining mark. That is the
 *      Vietnamese shape (`'á' + 's' > 'ấ'`: the tone key re-marks the
 *      vowel). Two near-miss shapes are deliberately excluded: a bare
 *      combining mark being swapped for another bare mark is a mark
 *      picker, not base-mark cycling (sil_ipa's `'*'` key); and a rule
 *      re-using a punctuation character (`'«' + '<' > '<<'` in
 *      sil_euro_latin, no decomposition) is an escape/doubling rule.
 */
export function detectReplacingCycling(ir: KeyboardIR): boolean {
  const producedByKey = new Map<string, Set<string>>();
  interface RuleShape {
    /** The context element immediately before the struck key, if a char. */
    replacedChar: string | null;
    /** Single chars this rule produces. */
    outChars: Set<string>;
    keySig: string;
  }
  const shapes: RuleShape[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Strip the codec's structural `+` separator elements before shape
      // analysis (the same cleaning the engine's mark-order detector does).
      const context = rule.context.filter(
        (el) => !(el.kind === "raw" && el.text.trim() === "+"),
      );
      const hasDeadkey = context.some(
        (el) => el.kind === "deadkey" || el.kind === "namedDeadkey",
      );
      if (hasDeadkey) continue;
      const key = context[context.length - 1];
      if (key === undefined) continue;
      if (key.kind !== "vkey" && key.kind !== "char") continue;
      const keySig =
        key.kind === "vkey"
          ? `vkey:${key.name}[${[...key.modifiers].sort().join(",")}]`
          : `char:${key.value}`;
      const outChars = new Set<string>();
      for (const el of rule.output) {
        if (el.kind === "char" && [...el.value].length === 1) outChars.add(el.value);
      }
      if (outChars.size > 0) {
        const existing = producedByKey.get(keySig) ?? new Set<string>();
        for (const c of outChars) existing.add(c);
        producedByKey.set(keySig, existing);
      }
      const prev = context[context.length - 2];
      shapes.push({
        replacedChar:
          prev !== undefined && prev.kind === "char" && [...prev.value].length === 1
            ? prev.value
            : null,
        outChars,
        keySig,
      });
    }
  }
  for (const shape of shapes) {
    if (shape.replacedChar === null) continue;
    const replacedCp = shape.replacedChar.codePointAt(0)!;
    if (replacedCp <= 0x7f) continue;
    if (!producedByKey.get(shape.keySig)?.has(shape.replacedChar)) continue;
    // Condition 5: precomposed-marked-letter replacement only.
    if (!isPrecomposedMarkedLetter(shape.replacedChar)) continue;
    for (const out of shape.outChars) {
      if (isPrecomposedMarkedLetter(out)) return true;
    }
  }
  return false;
}

/**
 * True for a single-codepoint letter that NFD-decomposes into a base plus
 * at least one combining mark (á, ấ, ệ…). Bare combining marks (CCC > 0)
 * and undecomposable characters are false.
 */
function isPrecomposedMarkedLetter(ch: string): boolean {
  if ([...ch].length !== 1) return false;
  if ((getCCC(ch.codePointAt(0)!) ?? 0) > 0) return false;
  const nfd = ch.normalize("NFD");
  if (nfd === ch) return false;
  for (const part of nfd) {
    if ((getCCC(part.codePointAt(0)!) ?? 0) > 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// A7a — remap posture from key-coverage shape
// ---------------------------------------------------------------------------

/**
 * Full-remap vs addition (alphabetic only, §7.1 A7a): among base-plane rules
 * struck on stock keys, the fraction whose produced character differs from
 * the stock character for that key. ≥ half reassigned → "full-remap"
 * (Russian/Armenian mnemonic style); otherwise "addition" (Akan style).
 * Returns undefined when there is no base-plane stock-key evidence.
 */
export function deriveRemapPosture(ir: KeyboardIR): "addition" | "full-remap" | undefined {
  const stock = STOCK_BASE_LAYOUTS[DEFAULT_BASELAYOUT] ?? {};
  let total = 0;
  let reassigned = 0;
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const key = rule.context[rule.context.length - 1];
      if (key === undefined || key.kind !== "vkey") continue;
      if (key.modifiers.length > 0) continue; // base plane only
      const stockChar = stock[key.name];
      if (stockChar === undefined) continue;
      const out = rule.output.find((el) => el.kind === "char");
      if (out === undefined || out.kind !== "char") continue;
      total++;
      if (out.value !== stockChar) reassigned++;
    }
  }
  if (total === 0) return undefined;
  return reassigned / total >= 0.5 ? "full-remap" : "addition";
}

// ---------------------------------------------------------------------------
// A2a — cluster sensitivity (abugida/abjad)
// ---------------------------------------------------------------------------

/**
 * Cluster sensitivity: output depends on prior context. Structural signal:
 * any rule carrying real match-context before its struck key (char, any,
 * notany, context, or deadkey elements), or any match/nomatch group — both
 * are context-choosing machinery. Absence of either → elicited-false.
 */
export function deriveClusterSensitivity(ir: KeyboardIR): boolean {
  for (const group of ir.groups) {
    if (group.rules.some((r) => r.context.length > 1)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The extractor
// ---------------------------------------------------------------------------

export interface DerivedAxes {
  /** The complete vector the decision tree ran on (derived + prior-filled). */
  axes: DiscoveryAxisVector;
  /** Axes the script-class prior filled (everything NOT derived). */
  axisFills: AxisFill[];
  /** The dominant ISO 15924 script A2 was classified from (null: no evidence). */
  dominantScript: string | null;
  /** The raw added-character count behind A1. */
  addedChars: number;
  /** Per-axis human-readable measurement notes, for report provenance. */
  evidence: Record<string, string>;
}

/**
 * Derive the axis vector for one recognized corpus keyboard IR.
 *
 * Derivation order matters: values derived here are placed on the partial
 * vector BEFORE `defaultFillAxes` runs, so the prior only ever fills axes
 * with no IR evidence (A5 multi-mode, and any axis whose derivation found
 * nothing). A3 (phonetic intuition) is a survey judgment with no direct IR
 * read; the corpus heuristic is: strong when the keyboard's content is
 * Latin-script (the typist's spelling IS Latin) or the layout declares
 * &MNEMONICLAYOUT, weak otherwise — recorded in `evidence` as a heuristic.
 */
export function deriveAxes(ir: KeyboardIR): DerivedAxes {
  const evidence: Record<string, string> = {};

  // A1
  const addedChars = addedCharCount(ir);
  const scale = a1Band(addedChars);
  evidence.scale = `${addedChars} added chars → ${scale}`;

  // A2
  const script = dominantScript(ir);
  const scriptClass: ScriptClass =
    script === null ? "alphabetic" : scriptClassOfScript(script);
  evidence.scriptClass =
    script === null
      ? "no script evidence in produced set; defaulted to alphabetic"
      : `dominant script ${script} → ${scriptClass}`;

  const partial: Partial<DiscoveryAxisVector> = { scale, scriptClass };

  // A3 (heuristic — see header comment)
  const mnemonic = isMnemonicLayout(ir);
  partial.phoneticIntuition = script === "Latn" || mnemonic ? "strong" : "weak";
  evidence.phoneticIntuition =
    script === "Latn"
      ? "heuristic: Latin-script content → strong"
      : mnemonic
        ? "heuristic: &MNEMONICLAYOUT declared → strong"
        : "heuristic: non-Latin, positional → weak";

  // A3a — the engine's import detector (postfix evidence only; it never
  // guesses prefix, so a non-detection leaves the axis for the prior).
  const markFill = detectMarkInputOrderFromImport(ir);
  if (markFill !== undefined && markFill.value === "postfix") {
    partial.markInputOrder = "postfix";
    evidence.markInputOrder = "postfix sequence-replace shape detected in IR";
  }

  // A4 — deadkey families + cycling (marks-station family counting:
  // 0 families → none, 1 → stacking-combining, ≥2 → multi-family;
  // a detected replacing-cycle outranks the family count).
  const families = deadkeyFamilies(ir);
  if (detectReplacingCycling(ir)) {
    partial.diacriticBehavior = "replacing-cycling";
    evidence.diacriticBehavior = "replacing-cycle shape detected in IR";
  } else {
    partial.diacriticBehavior =
      families.size === 0 ? "none" : families.size === 1 ? "stacking-combining" : "multi-family";
    evidence.diacriticBehavior = `${families.size} deadkey famil${families.size === 1 ? "y" : "ies"} → ${partial.diacriticBehavior}`;
  }

  // A6 — loud when any rule beeps; soft when any rule suppresses via `nul`
  // in a context-guarded (match/nomatch-style) rule; otherwise leave to prior.
  let sawBeep = false;
  let sawSuppression = false;
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if (el.kind === "beep") sawBeep = true;
        if (el.kind === "nul") sawSuppression = true;
      }
    }
  }
  if (sawBeep) {
    partial.constraintEnforcement = "loud";
    evidence.constraintEnforcement = "beep output present in IR";
  } else if (sawSuppression) {
    partial.constraintEnforcement = "soft";
    evidence.constraintEnforcement = "nul suppression output present in IR";
  }

  // A7 — the canonical key-budget measurement, projected (never re-derived).
  const budget = measureKeyBudget(ir);
  if (budget !== null) {
    partial.spareKeyAvailability = keyBudgetToSpareKeyAvailability(budget.band);
    evidence.spareKeyAvailability = budget.notes;
  } else {
    // No physical-key surface to measure (touch-only / store-driven IR):
    // no plane is saturated by definition of there being no plane bindings.
    partial.spareKeyAvailability = "many";
    evidence.spareKeyAvailability = "no physical-key surface measured; defaulted to many";
  }

  // A7a — alphabetic only (the prior/student axis is N/A otherwise).
  if (scriptClass === "alphabetic") {
    const posture = deriveRemapPosture(ir);
    if (posture !== undefined) {
      partial.remapPosture = posture;
      evidence.remapPosture = `base-plane stock-key reassignment → ${posture}`;
    }
  }

  // A2a — abugida/abjad only; rule 2 reads exactly `true`.
  if (scriptClass === "abugida" || scriptClass === "abjad") {
    partial.clusterSensitivity = deriveClusterSensitivity(ir);
    evidence.clusterSensitivity = partial.clusterSensitivity
      ? "context-carrying rules present"
      : "no context-carrying rules";
  }

  const { axes, axisFills } = defaultFillAxes(partial);
  return { axes, axisFills, dominantScript: script, addedChars, evidence };
}
