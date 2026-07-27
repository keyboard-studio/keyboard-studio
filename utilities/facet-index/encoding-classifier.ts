/**
 * Encoding classifier (spec 041 US1, T013) — rule-structure archetype, `set`
 * valueType with per-role sub-profiles.
 *
 * The codec normalizes literals (`'a'` and `U+0061` both parse to the same IR
 * char node), so SOURCE SPELLING is not in the IR — it must be read from the
 * `.kmn` text. We anchor to the IR rule population (each rule's `sourceLine`)
 * for determinism, then classify that source line's spelling:
 *
 *   - Input LHS key-refs: `bare-vk` (`[K_A]`), `named-modifier` (`[SHIFT K_A]`),
 *     `split-modifier` (2+ modifiers, e.g. `[NCAPS SHIFT K_A]`);
 *   - Output/base/combining literals: `quoted-literal` (`'x'`/`"x"`) vs
 *     `u-notation` (`U+XXXX` / `\uXXXX` / `dNNN`).
 *
 * The **match-kind axis** (key-ref vs char-ref vs mixed) is recorded distinctly
 * in `subProfile` and is NEVER auto-normalized (it is semantic, not a
 * behaviour-preserving spelling choice — FR-012). The distribution is the share
 * of each concrete spelling tag over all classified tokens; minority spellings
 * therefore show up as small distribution shares (AS-2).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

import { mapImportStatus, computeAnalyzedCoverage } from "./outcome.js";
import { undeterminedFallback } from "./measurement.js";
import { eachRule } from "./ir-scan.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

// Patterns are non-global at module scope (safe for `.test`); counting uses a
// fresh global clone per call so `lastIndex` state never leaks across lines.
const KEY_GROUP = /\[([^\]]*)\]/g; // used only with matchAll (stateless per call)
const U_NOTATION = /(?:U\+[0-9A-Fa-f]{4,6}|\\u[0-9A-Fa-f]{4}|\bd\d{2,6}\b)/;
const QUOTED_LITERAL = /'[^']*'|"[^"]*"/;

/** Count non-overlapping matches of a pattern in a string (fresh global regex). */
function countMatches(str: string, pattern: RegExp): number {
  const g = new RegExp(pattern.source, "g");
  return (str.match(g) ?? []).length;
}
/** Named modifiers that may precede the vkey inside `[...]`. */
const MODIFIERS = new Set([
  "SHIFT", "CTRL", "LCTRL", "RCTRL", "ALT", "LALT", "RALT", "ALTGR",
  "CAPS", "NCAPS", "LSHIFT", "RSHIFT",
]);

interface Tally {
  bareVk: number;
  namedModifier: number;
  splitModifier: number;
  quotedLiteral: number;
  uNotation: number;
  charRefInput: number;
}

/** Split a source line into its LHS (context) and RHS (output) around the first `>`. */
function splitRule(line: string): { lhs: string; rhs: string } | null {
  const gt = line.indexOf(">");
  if (gt < 0) return null;
  return { lhs: line.slice(0, gt), rhs: line.slice(gt + 1) };
}

/** Classify one `[...]` key-reference's modifier spelling. */
function keyRefSpelling(inner: string): "bareVk" | "namedModifier" | "splitModifier" {
  const tokens = inner.trim().split(/\s+/).filter(Boolean);
  const mods = tokens.filter((t) => MODIFIERS.has(t.toUpperCase()));
  if (mods.length === 0) return "bareVk";
  if (mods.length === 1) return "namedModifier";
  return "splitModifier";
}

export function classifyEncoding(ir: KeyboardIR, def: FacetDefinition, kb: ScannedKeyboard): Categorization | null {
  void def;
  if (kb.kmnText === null) return null;
  const lines = kb.kmnText.split(/\r?\n/);

  const t: Tally = {
    bareVk: 0, namedModifier: 0, splitModifier: 0, quotedLiteral: 0, uNotation: 0, charRefInput: 0,
  };

  for (const { rule } of eachRule(ir)) {
    if (rule.sourceLine === undefined) continue;
    const raw = lines[rule.sourceLine - 1];
    if (raw === undefined) continue;
    const parts = splitRule(raw);
    if (parts === null) continue;

    // Input LHS: key-references and their modifier spelling.
    let keyRefs = 0;
    for (const m of parts.lhs.matchAll(KEY_GROUP)) {
      keyRefs += 1;
      const spelling = keyRefSpelling(m[1] ?? "");
      if (spelling === "bareVk") t.bareVk += 1;
      else if (spelling === "namedModifier") t.namedModifier += 1;
      else t.splitModifier += 1;
    }
    // Char-reference input (mnemonic): a literal on the LHS, not a [...] key.
    const lhsNoKeys = parts.lhs.replace(KEY_GROUP, " ");
    if (keyRefs === 0 && (QUOTED_LITERAL.test(lhsNoKeys) || U_NOTATION.test(lhsNoKeys))) {
      t.charRefInput += 1;
    }

    // Output RHS literal spelling.
    t.quotedLiteral += countMatches(parts.rhs, QUOTED_LITERAL);
    t.uNotation += countMatches(parts.rhs, U_NOTATION);
  }

  // Sorted by tag so the dominant pick uses the same lexicographic tie-break as
  // the rest of the tool (FR-006), not the literal declaration order.
  const distEntries: Array<[string, number]> = [
    ["bare-vk", t.bareVk],
    ["named-modifier", t.namedModifier],
    ["split-modifier", t.splitModifier],
    ["quoted-literal", t.quotedLiteral],
    ["u-notation", t.uNotation],
  ].sort((a, b) => (a[0] as string).localeCompare(b[0] as string)) as Array<[string, number]>;
  const total = distEntries.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return null; // no classifiable spelling tokens — fall through

  const distribution: Record<string, number> = {};
  let dominant = "";
  let dominantShare = 0;
  for (const [tag, n] of distEntries) {
    if (n === 0) continue;
    const share = n / total;
    distribution[tag] = share;
    if (share > dominantShare) {
      dominant = tag;
      dominantShare = share;
    }
  }

  const value = Object.keys(distribution).sort(); // set members observed
  const matchKind =
    (t.bareVk + t.namedModifier + t.splitModifier > 0) && t.charRefInput > 0
      ? "mixed"
      : t.charRefInput > 0
        ? "char-ref"
        : "key-ref";

  const confidenceClass: ConfidenceClass = dominantShare >= 0.8 ? "confident" : "mixed";
  const status = ir.raw.length > 0 ? ImportStatus.CleanWithOpaque : ImportStatus.Clean;

  return {
    value,
    distribution,
    confidence: null,
    confidenceClass,
    provenanceTier: "content-derived",
    evidenceSize: total,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: mapImportStatus(status),
    subProfile: { input: { matchKind } },
  };
}

export function encodingFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no classifiable encoding tokens; encoding undetermined");
}
