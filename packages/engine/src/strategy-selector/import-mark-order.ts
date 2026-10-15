// see spec.md §7.2 rule 3a — base-derived A3a (mark-input order) detection.
//
// Consumed by the live studio pipeline: at instantiation (either track)
// seedIrAxesFromStartIr (studio workingCopyStore.ts) runs this over the base IR
// and seeds markInputOrder="postfix" onto irAxes, which flows through
// defaultFillAxes into selectStrategy — so rule 3a fires in production, not just
// in tests. (The engine's own importKeyboard() also surfaces it via axisFills.)
//
// Complements the script-class default-fill prior (default-fill.ts), which
// deliberately never fills markInputOrder="postfix" (that prior can only ever
// justify the unmarked "prefix" state from script class alone). This module
// supplies the other legitimate source of a postfix value: real structural
// evidence in an imported base's KeyboardIR that the keyboard already uses
// letter-then-mark sequence-replace rules.
//
// Reference shape (release/sil/sil_ipa/source/sil_ipa.kmn, the §7.5 IPA
// exemplar): `any(equalD) + "=" > index(equalU,1)` — an already-produced base
// character (any() over a base-output store, NOT a deadkey) followed by a
// single literal diacritic-trigger key, collapsing to the marked form via
// index(). The base is typed first and the mark-trigger second: postfix.
//
// SCOPE (spec §7.2 rule 3a): this detects the postfix shape in both of its
// surface forms:
//   1. The unconditional form above, which the codec parses into typed
//      group.rules (offset 1: the any() leads the context).
//   2. The `if(option_key=…)`-guarded form, e.g. the live sil_ipa rule
//      `if(option_key = '') any(equalD) + "=" > index(equalU,2)`. The codec
//      classifies any `if(...)` context as opaque (parse.ts →
//      IF_OPTION_STORE), so guarded rules never reach group.rules — but they
//      ARE preserved in `ir.raw[]` as RawKmnFragments with that reason, full
//      `sourceText`, and a `producedOutput` RHS sketch. The guarded scan
//      below pattern-matches those fragments: the guard occupies context
//      position 1, so the any()'s position (and the required index() offset)
//      is resolved from the token order, not assumed — it is 2 in the live
//      shape. Guarded rules are therefore reachable through this path today,
//      including the live sil_ipa postfix rules.
//
// PARALLEL-STORE PREDICATE (spec §7.2 rule 3a narrowing): the shape alone is
// not enough — any parallel-store remap (`any(letters) + "k" >
// index(otherLetters,1)`) has it, diacritic or not. For the unconditional
// form, the detector therefore additionally requires the any() input store
// and the index() output store to resolve in `ir.stores`, be distinct
// stores of equal (non-zero) length,
// and have EVERY positionally paired entry related, where
// related(base, marked) holds iff either
//   (a) decomposition: NFD(marked) begins with the base entry's codepoints
//       and every remaining NFD codepoint is a combining mark (canonical
//       combining class > 0, or General_Category M*), e.g. a → á; or
//   (b) name extension: both entries are single codepoints and
//       getName(marked) starts with getName(base) + " ".
// Signal (b) exists because the exemplar's marked letters are precomposed
// with NO decomposition mapping — U+0253/U+0257/U+0260 (sil_ipa's equalU)
// decompose to themselves, so signal (a) alone can never relate b/d/g to
// them; their names, however, extend the base names ("LATIN SMALL LETTER B"
// → "LATIN SMALL LETTER B WITH HOOK"). A naive "output store contains
// combining marks" test fails the same exemplar for the same reason, which
// is why the predicate is about the base↔marked relationship, not about the
// output store's content in isolation.
// Absence honesty: if either store is missing from `ir.stores` the detector
// does not fire — unresolved refs are no evidence, never a default pass.
// Non-char store items (vkey/deadkey/raw) are never related. Multi-codepoint
// char items are handled on codepoints per the signals above (a decomposed
// marked item such as "a" + U+0301 relates to "a" via (a)); anything the two
// signals do not cover is treated as unrelated (conservative).

import type {
  AxisFill,
  IRStore,
  IRRule,
  KeyboardIR,
  RawKmnFragment,
  StoreItem,
} from "@keyboard-studio/contracts";
import {
  getCategory,
  getCCC,
  getName,
} from "@keyboard-studio/contracts/unicode";

/**
 * The store refs of `rule`'s postfix sequence-replace shape —
 * [any(store), char] > index(store, N) — or `undefined` when the rule does
 * not have that shape. This is the letter-then-mark mirror of the S-02
 * `[dk(D), any(BASE)] > index(OUT, 2)` body shape — no deadkey involved,
 * and the any() comes first rather than last.
 *
 * The codec preserves a structural inline `+` as a `{kind:"raw", text:"+"}`
 * context element when it falls after real pre-context rather than leading
 * the rule (see emit.ts's `hasInlinePlus`) — e.g. the real sil_ipa source
 * `any(equalD) + "=" > index(equalU,1)` parses to context
 * `[any(equalD), raw("+"), char("=")]`. Strip it before inspecting shape.
 */
function postfixMarkSequenceRefs(
  rule: IRRule,
): { baseRef: string; markedRef: string } | undefined {
  const real = rule.context.filter(
    (el) => !(el.kind === "raw" && el.text.trim() === "+"),
  );
  if (real.length !== 2) return undefined;
  const base = real[0];
  const trigger = real[1];
  if (base === undefined || base.kind !== "any") return undefined;
  if (trigger === undefined || trigger.kind !== "char") return undefined;
  if (rule.output.length !== 1) return undefined;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "index") return undefined;
  // Alignment invariant: the index() offset must point at the any()'s position
  // in the context. Unlike the S-02 fan-out shape (any() *terminal*, so
  // offset === context.length; see isParallelIndexFanOut), here any() *leads*,
  // so its 1-based position — and the required offset — is 1. The real
  // guard-free sil_ipa rule confirms this: `any(equalD) + "=" > index(equalU,1)`.
  // (Offset 2 only appears on the `if(…)`-guarded variants, where the guard
  // occupies position 1 — those are handled by the raw-fragment scan below,
  // since they are opaque at parse time; see the module header.)
  if (out.offset !== 1) return undefined;
  return { baseRef: base.storeRef, markedRef: out.storeRef };
}

/** True iff `cp` is a combining mark: ccc > 0, or General_Category M*. */
function isCombiningMark(cp: number): boolean {
  const ccc = getCCC(cp);
  if (ccc !== undefined && ccc > 0) return true;
  const category = getCategory(cp);
  return category !== undefined && category.startsWith("M");
}

/**
 * True iff the paired store entries are related as base → marked form, per
 * the two signals documented in the module header (decomposition, or
 * single-codepoint name extension). Anything else — non-char items, empty
 * values, identical entries, unrelated letters — is not related.
 */
function isRelatedPair(baseItem: StoreItem, markedItem: StoreItem): boolean {
  if (baseItem.kind !== "char" || markedItem.kind !== "char") return false;
  const baseCps = [...baseItem.value];
  const markedCps = [...markedItem.value];
  if (baseCps.length === 0 || markedCps.length === 0) return false;

  // (a) Decomposition: NFD(marked) starts with the base codepoints and adds
  // at least one further codepoint, every one of them a combining mark.
  // Requiring at least one added mark keeps an identical pair unrelated.
  const nfdMarkedCps = [...markedItem.value.normalize("NFD")];
  if (
    nfdMarkedCps.length > baseCps.length &&
    baseCps.every((cp, i) => nfdMarkedCps[i] === cp) &&
    nfdMarkedCps.slice(baseCps.length).every((ch) => {
      const cp = ch.codePointAt(0);
      return cp !== undefined && isCombiningMark(cp);
    })
  ) {
    return true;
  }

  // (b) Name extension (single codepoints only): the marked letter's name
  // extends the base letter's name — the precomposed, non-decomposing case
  // (e.g. b → U+0253 "LATIN SMALL LETTER B WITH HOOK").
  if (baseCps.length === 1 && markedCps.length === 1) {
    const baseCp = baseCps[0]?.codePointAt(0);
    const markedCp = markedCps[0]?.codePointAt(0);
    if (baseCp !== undefined && markedCp !== undefined) {
      const baseName = getName(baseCp);
      const markedName = getName(markedCp);
      if (
        baseName !== undefined &&
        markedName !== undefined &&
        markedName.startsWith(`${baseName} `)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True iff the any() input store and the index() output store form a
 * genuine base→marked parallel remap: both resolve in `ir.stores`, are
 * distinct stores, have equal non-zero length, and every paired entry is
 * related. A store that does not resolve is no evidence — never a pass.
 */
function isBaseToMarkedRemap(
  ir: KeyboardIR,
  baseRef: string,
  markedRef: string,
): boolean {
  if (baseRef === markedRef) return false;
  const baseStore: IRStore | undefined = ir.stores.find(
    (s) => s.name === baseRef,
  );
  const markedStore: IRStore | undefined = ir.stores.find(
    (s) => s.name === markedRef,
  );
  if (baseStore === undefined || markedStore === undefined) return false;
  if (baseStore === markedStore) return false;
  if (
    baseStore.items.length === 0 ||
    baseStore.items.length !== markedStore.items.length
  )
    return false;
  return baseStore.items.every((baseItem, i) => {
    const markedItem = markedStore.items[i];
    return markedItem !== undefined && isRelatedPair(baseItem, markedItem);
  });
}

// ---------------------------------------------------------------------------
// Guarded shape — RawKmnFragment scan
// ---------------------------------------------------------------------------

/**
 * Split a KMN rule line into whitespace-separated tokens, keeping quoted
 * strings, `[...]` bracket groups, and parenthesised groups (e.g.
 * `if(option_key = '')`, `index(equalU,2)`) intact as single tokens. Mirrors
 * the codec's tokeniser (parse.ts splitTokens) for the fragment shapes this
 * scan accepts.
 */
function splitKmnTokens(text: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === "'" || ch === '"') {
      const q = ch;
      let j = i + 1;
      while (j < text.length && text[j] !== q) j++;
      result.push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (ch === "[") {
      let j = i + 1;
      while (j < text.length && text[j] !== "]") j++;
      result.push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    let depth = 0;
    while (j < text.length) {
      const c = text[j] ?? "";
      if (c === "(") { depth++; j++; continue; }
      if (c === ")") { depth--; j++; continue; }
      if (depth === 0) {
        if (c === " " || c === "\t") break;
        if (c === "'" || c === '"' || c === "[") break;
      }
      j++;
    }
    result.push(text.slice(i, j));
    i = j;
  }
  return result.filter((t) => t.length > 0);
}

/**
 * Split a rule's source text at its top-level `>` arrow (quote-, bracket-
 * and paren-aware, so a `">"` trigger literal is not mistaken for the arrow).
 * Returns null when there is no top-level arrow.
 */
function splitRuleArrow(text: string): { lhs: string; rhs: string } | null {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;
    if (ch === "[" || ch === "(") { depth++; continue; }
    if (ch === "]" || ch === ")") { depth--; continue; }
    if (depth === 0 && ch === ">") {
      return { lhs: text.slice(0, i).trim(), rhs: text.slice(i + 1).trim() };
    }
  }
  return null;
}

/**
 * Strip a trailing `c <comment>` from a rule RHS, following the KMN lexer
 * convention the codec uses (a whitespace-delimited `c` token outside quotes
 * and brackets starts the comment).
 */
function stripTrailingComment(rhs: string): string {
  let inS = false;
  let inD = false;
  let depth = 0;
  for (let i = 0; i < rhs.length; i++) {
    const ch = rhs[i];
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    if (
      depth === 0 &&
      ch === "c" &&
      /\s/.test(rhs[i - 1] ?? "") &&
      (i === rhs.length - 1 || /\s/.test(rhs[i + 1] ?? ""))
    ) {
      return rhs.slice(0, i).trim();
    }
  }
  return rhs;
}

/** True iff `tok` is a single-character trigger: a quoted one-codepoint
 *  string or a `U+XXXX` literal. Multi-character strings and `[vkey]`
 *  inputs are not the single literal trigger of the postfix shape. */
function isSingleCharToken(tok: string): boolean {
  if (/^U\+[0-9A-Fa-f]{4,6}$/.test(tok)) return true;
  const q = tok[0];
  if ((q === "'" || q === '"') && tok.length >= 2 && tok.endsWith(q)) {
    return [...tok.slice(1, -1)].length === 1;
  }
  return false;
}

const ANY_TOKEN = /^any\s*\(\s*([^\s()]+)\s*\)$/i;
const INDEX_TOKEN = /^index\s*\(\s*([^\s,()]+)\s*,\s*(\d+)\s*\)$/i;

/**
 * True iff `frag` is an `if(...)`-guarded postfix sequence-replace rule:
 * `if(guard) any(base) + <single char> > index(marked, N)` where N equals
 * the any()'s resolved 1-based context position (the guard occupies
 * position 1, so N is 2 in the live shape — computed from the token order
 * rather than hard-coded, so additional leading context would shift it).
 *
 * The LHS and guard are recovered from `sourceText` (the codec deliberately
 * keeps guard/context content out of `producedOutput`); the RHS is taken
 * from the `producedOutput` sketch when present and from `sourceText`
 * otherwise — when both are available they must agree, and the RHS must be
 * exactly one index() element (a guarded rule with extra output, like the
 * sil_ipa subscript rota rule's trailing literal, is not this shape).
 */
function isGuardedPostfixMarkSequence(frag: RawKmnFragment): boolean {
  // Reason string per OPAQUE_REASONS.IF_OPTION_STORE (codec/opaque-reasons.ts).
  if (frag.reason !== "if-option-store") return false;

  const split = splitRuleArrow(frag.sourceText);
  if (split === null) return false;

  const lhsToks = splitKmnTokens(split.lhs);
  // The guard must lead the rule and be a single balanced if(...) token.
  const guard = lhsToks[0];
  if (guard === undefined || !/^if\s*\(/i.test(guard) || !guard.endsWith(")")) return false;

  // Exactly one `+` separator splits context from the triggering input.
  const plusIdx = lhsToks.indexOf("+");
  if (plusIdx === -1 || lhsToks.indexOf("+", plusIdx + 1) !== -1) return false;

  // Context (between guard and `+`) must be exactly the leading any(base).
  const contextToks = lhsToks.slice(1, plusIdx);
  if (contextToks.length !== 1) return false;
  const anyTok = contextToks[0];
  if (anyTok === undefined || !ANY_TOKEN.test(anyTok)) return false;

  // Input (after `+`) must be exactly one single-character trigger.
  const inputToks = lhsToks.slice(plusIdx + 1);
  if (inputToks.length !== 1) return false;
  const trigger = inputToks[0];
  if (trigger === undefined || !isSingleCharToken(trigger)) return false;

  // Resolve the any()'s 1-based position among the non-`+` LHS tokens: the
  // guard counts as a context element, the `+` separator does not.
  const anyPosition = lhsToks.slice(0, plusIdx).filter((t) => t !== "+").indexOf(anyTok) + 1;

  // RHS from sourceText: after stripping any trailing comment it must be a
  // single index(marked, N) token.
  const rhsToks = splitKmnTokens(stripTrailingComment(split.rhs));
  let sourceIndex: { storeRef: string; offset: number } | undefined;
  if (rhsToks.length === 1) {
    const m = INDEX_TOKEN.exec(rhsToks[0] ?? "");
    if (m !== null) {
      sourceIndex = { storeRef: m[1] ?? "", offset: Number(m[2]) };
    }
  }

  // RHS from the producedOutput sketch: exactly one index() element.
  let sketchIndex: { storeRef: string; offset: number } | undefined;
  if (frag.producedOutput !== undefined) {
    if (frag.producedOutput.length !== 1) return false;
    const out = frag.producedOutput[0];
    if (out === undefined || out.kind !== "index") return false;
    sketchIndex = { storeRef: out.storeRef, offset: out.offset };
  }

  // At least one RHS witness is required, and the two must agree.
  const rhsIndex = sketchIndex ?? sourceIndex;
  if (rhsIndex === undefined) return false;
  if (
    sketchIndex !== undefined &&
    sourceIndex !== undefined &&
    (sketchIndex.storeRef !== sourceIndex.storeRef || sketchIndex.offset !== sourceIndex.offset)
  ) {
    return false;
  }

  // Alignment invariant, guarded form: the index() offset must point at the
  // any()'s resolved position (guard at 1, any() at 2 in the live shape).
  // An offset-2 index() WITHOUT the guard is rejected by the typed-rule
  // scan above (its any() sits at position 1); here the guard is present in
  // sourceText, so offset 2 is the correct alignment.
  return rhsIndex.offset === anyPosition;
}

/**
 * Scan an imported `KeyboardIR` for postfix mark-input-order evidence (spec
 * §7.1 A3a) and, when found, return the {@link AxisFill} provenance record
 * for `markInputOrder="postfix"`. Returns `undefined` when no such structure
 * is present — callers must not assume a fill happens.
 *
 * Unlike the script-class default-fill prior (which never emits "postfix"),
 * this is real structural evidence from the base itself, hence the distinct
 * "import-derived" source tag.
 *
 * Note on A2 gating: A3a (mark-input order) is an alphabetic-only sub-axis, but
 * this detector reports the structural evidence unconditionally — it operates on
 * the IR alone and does not know the (survey-derived) script class at import
 * time. The alphabetic gate is enforced downstream where the fill is consumed:
 * rule 3a fires only when A2=alphabetic AND A3=strong AND A3a=postfix all hold
 * (see rules.ts / selectStrategy), so a postfix fill on a non-alphabetic base
 * never selects S-03.
 *
 * @see spec.md §7.2 rule 3a
 */
export function detectMarkInputOrderFromImport(
  ir: KeyboardIR,
): AxisFill | undefined {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const refs = postfixMarkSequenceRefs(rule);
      if (
        refs !== undefined &&
        isBaseToMarkedRemap(ir, refs.baseRef, refs.markedRef)
      ) {
        return {
          axis: "markInputOrder",
          value: "postfix",
          source: "import-derived",
        };
      }
    }
  }
  // Guarded rules never reach group.rules (opaque at parse time); they are
  // preserved as raw fragments, so scan those too.
  for (const frag of ir.raw) {
    if (isGuardedPostfixMarkSequence(frag)) {
      return { axis: "markInputOrder", value: "postfix", source: "import-derived" };
    }
  }
  return undefined;
}
