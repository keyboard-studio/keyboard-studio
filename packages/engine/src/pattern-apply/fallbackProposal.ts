// Per-class fallback proposals (spec 109 FR-020).
//
// For each leak class (letters, digits, punctuation and symbols) the engine
// proposes "Do nothing" or "Use the computer's layout" from what the keyboard
// itself emits and what the picked base keyboards leak. A proposal is a
// default the author confirms, never an applied setting (FR-021), and it
// carries the evidence that triggered it.
//
// The target script comes in already filled (likely subtags are the caller's
// concern). Characters are classed by Unicode General Category; scripts use
// `Script_Extensions`, so a shared mark or a danda does not read as foreign.

import type { Disposition, KeyboardIR, LeakClass } from "@keyboard-studio/contracts";
import { LEAK_CLASSES, type Leak } from "./fallbackPolicy.js";

/** The evidence behind a proposal: what triggered it, where, and how many leaks. */
export interface ProposalEvidence {
  baseKeyboard: string;
  char: string;
  count: number;
}

export interface Proposal {
  class: LeakClass;
  disposition: Disposition;
  /** Null when the class has nothing to point at (no leak and nothing the keyboard emits). */
  evidence: ProposalEvidence | null;
}

export interface FallbackProposalInput {
  ir: KeyboardIR;
  /** ISO 15924 script of the keyboard's language tag, e.g. "Hang". Filled by the caller. */
  targetScript: string;
  /** Leaks joined by the caller from base-keyboard data. */
  leaks: readonly Leak[];
  /**
   * Script of each base keyboard's catalog language tags, keyed by base keyboard
   * id. Used only where a base keyboard has no character data (all its leaks
   * "unknown"), so the letters proposal still has something to compare.
   */
  baseKeyboardScripts?: Readonly<Record<string, string>>;
}

const LETTER = /^[\p{L}\p{M}]$/u;
const DIGIT = /^\p{Nd}$/u;
const PUNCT = /^[\p{P}\p{S}]$/u;
/** A script-neutral character (a shared mark, a modifier) never reads as foreign. */
const NEUTRAL_SCRIPT = /^[\p{Script=Common}\p{Script=Inherited}]$/u;

/** The leak class of one character by General Category, or null for anything else. */
export function classifyChar(char: string): LeakClass | null {
  if (LETTER.test(char)) return "letters";
  if (DIGIT.test(char)) return "digits";
  if (PUNCT.test(char)) return "punctuation";
  return null;
}

function scriptExtensionsTest(script: string): RegExp | null {
  if (!/^[A-Za-z]{4}$/.test(script)) return null;
  try {
    return new RegExp(`^\\p{Script_Extensions=${script}}$`, "u");
  } catch {
    return null;
  }
}

/** The zero code point of the decimal digit set a Nd character belongs to. */
function digitSetOf(char: string): number {
  const cp = char.codePointAt(0) ?? 0;
  let start = cp;
  while (start > 0 && DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  return start + Math.floor((cp - start) / 10) * 10;
}

/** Every character the keyboard itself types: rule output literals and typed stores. */
function emittedChars(ir: KeyboardIR): string[] {
  const chars: string[] = [];
  const typedStores = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if (el.kind === "char") chars.push(...Array.from(el.value));
        else if (el.kind === "index" || el.kind === "outs") typedStores.add(el.storeRef);
      }
    }
  }
  for (const store of ir.stores) {
    if (store.isSystem || !typedStores.has(store.name)) continue;
    for (const item of store.items) {
      if (item.kind === "char") chars.push(...Array.from(item.value));
    }
  }
  return chars;
}

function charLeaks(leaks: readonly Leak[], cls: LeakClass): Array<Leak & { char: string }> {
  const out: Array<Leak & { char: string }> = [];
  for (const leak of leaks) {
    if (leak.outcome.kind === "char" && leak.outcome.leakClass === cls) {
      out.push({ ...leak, char: leak.outcome.char });
    }
  }
  return out;
}

function countOnBase(leaks: readonly Leak[], baseKeyboard: string, cls: LeakClass): number {
  return charLeaks(leaks, cls).filter((l) => l.baseKeyboard === baseKeyboard).length;
}

/** Evidence for a class that passes through: the first leak of the class, if any. */
function representative(leaks: readonly Leak[], cls: LeakClass): ProposalEvidence | null {
  const first = charLeaks(leaks, cls)[0];
  if (first === undefined) return null;
  return {
    baseKeyboard: first.baseKeyboard,
    char: first.char,
    count: countOnBase(leaks, first.baseKeyboard, cls),
  };
}

function proposeLetters(input: FallbackProposalInput): Proposal {
  const target = scriptExtensionsTest(input.targetScript);
  if (target !== null) {
    const foreign = charLeaks(input.leaks, "letters").filter((l) => !target.test(l.char) && !NEUTRAL_SCRIPT.test(l.char));
    const first = foreign[0];
    if (first !== undefined) {
      return {
        class: "letters",
        disposition: "swallow",
        evidence: {
          baseKeyboard: first.baseKeyboard,
          char: first.char,
          count: foreign.filter((l) => l.baseKeyboard === first.baseKeyboard).length,
        },
      };
    }
    // No character data: fall back to the base keyboard's catalog language script.
    for (const [baseKeyboard, script] of Object.entries(input.baseKeyboardScripts ?? {})) {
      const hasData = input.leaks.some(
        (l) => l.baseKeyboard === baseKeyboard && l.outcome.kind === "char",
      );
      if (hasData || script.toLowerCase() === input.targetScript.toLowerCase()) continue;
      const unknown = input.leaks.filter(
        (l) => l.baseKeyboard === baseKeyboard && l.outcome.kind === "unknown",
      ).length;
      return {
        class: "letters",
        disposition: "swallow",
        evidence: { baseKeyboard, char: "", count: unknown },
      };
    }
  }
  return { class: "letters", disposition: "pass-through", evidence: representative(input.leaks, "letters") };
}

function proposeDigits(input: FallbackProposalInput): Proposal {
  const leaked = new Set(charLeaks(input.leaks, "digits").map((l) => digitSetOf(l.char)));
  // No digit leak to compare against: assume the ASCII digits every catalog layout types.
  if (leaked.size === 0) leaked.add(0x30);
  const own = emittedChars(input.ir).find((c) => DIGIT.test(c) && !leaked.has(digitSetOf(c)));
  if (own !== undefined) {
    const base = charLeaks(input.leaks, "digits")[0]?.baseKeyboard ?? input.leaks[0]?.baseKeyboard ?? "";
    return {
      class: "digits",
      disposition: "swallow",
      evidence: { baseKeyboard: base, char: own, count: countOnBase(input.leaks, base, "digits") },
    };
  }
  return { class: "digits", disposition: "pass-through", evidence: representative(input.leaks, "digits") };
}

function proposePunctuation(input: FallbackProposalInput): Proposal {
  const target = scriptExtensionsTest(input.targetScript);
  if (target !== null) {
    const own = emittedChars(input.ir).find((c) => /^\p{P}$/u.test(c) && target.test(c));
    if (own !== undefined) {
      const base =
        charLeaks(input.leaks, "punctuation")[0]?.baseKeyboard ?? input.leaks[0]?.baseKeyboard ?? "";
      return {
        class: "punctuation",
        disposition: "swallow",
        evidence: { baseKeyboard: base, char: own, count: countOnBase(input.leaks, base, "punctuation") },
      };
    }
  }
  return {
    class: "punctuation",
    disposition: "pass-through",
    evidence: representative(input.leaks, "punctuation"),
  };
}

/**
 * One proposal per leak class, in {@link LEAK_CLASSES} order.
 *
 * - Letters: "Do nothing" when any picked base keyboard leaks a letter outside
 *   the target script; otherwise "Use the computer's layout".
 * - Digits: "Do nothing" when the keyboard emits decimal digits of a different
 *   digit set from the leaked ones.
 * - Punctuation and symbols: "Do nothing" when the keyboard emits punctuation
 *   whose Script_Extensions include the target script.
 */
export function proposeFallbackPolicy(input: FallbackProposalInput): Proposal[] {
  const byClass: Record<LeakClass, Proposal> = {
    letters: proposeLetters(input),
    digits: proposeDigits(input),
    punctuation: proposePunctuation(input),
  };
  return LEAK_CLASSES.map((c) => byClass[c]);
}
