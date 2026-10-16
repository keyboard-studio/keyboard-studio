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
//      `if(option_key = '') any(equalD) + "=" > index(equalU,2)`. Since
//      spec 103 the codec types the guard as a `{kind:"if"}` context
//      element, so guarded rules reach group.rules like any other rule and
//      this detector reads the guard from typed IR. (The Approach A interim
//      — a raw-fragment text scan over `ir.raw[]` — is retired; the codec
//      is now the single owner of what `if(...)` means.) The guard
//      occupies context position 1, so the any()'s position (and the
//      required index() offset) counts it — it is 2 in the live shape.
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
export function postfixMarkSequenceRefs(
  rule: IRRule,
): { baseRef: string; markedRef: string; guardCount: number } | undefined {
  const real = rule.context.filter(
    (el) => !(el.kind === "raw" && el.text.trim() === "+"),
  );
  // Leading typed guards (spec 103) are conditions on the rule, not part of
  // the sequence-replace shape — but they DO occupy context positions, so
  // they count toward the any()'s position below.
  let guardCount = 0;
  while (real[guardCount]?.kind === "if") guardCount++;
  const shape = real.slice(guardCount);
  if (shape.length !== 2) return undefined;
  const base = shape[0];
  const trigger = shape[1];
  if (base === undefined || base.kind !== "any") return undefined;
  if (trigger === undefined || trigger.kind !== "char") return undefined;
  if (rule.output.length !== 1) return undefined;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "index") return undefined;
  // Alignment invariant: the index() offset must point at the any()'s position
  // in the context. Unlike the S-02 fan-out shape (any() *terminal*, so
  // offset === context.length; see isParallelIndexFanOut), here any() *leads*
  // the shape, so its 1-based position — and the required offset — is
  // 1 + the number of leading guards. The real guard-free sil_ipa rule
  // confirms the base case: `any(equalD) + "=" > index(equalU,1)`; the
  // guarded variants carry offset 2, the guard occupying position 1.
  if (out.offset !== guardCount + 1) return undefined;
  return { baseRef: base.storeRef, markedRef: out.storeRef, guardCount };
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
export function isBaseToMarkedRemap(
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
      // Evidence standard, preserved from the retired fragment scan: a
      // GUARDED rule fires on shape + offset alignment alone — the scan
      // never resolved the guard's stores, and the live sil_ipa pairs do
      // not all pass the relation check below (B -> small-capital B is a
      // name change, not a name extension), so tightening guarded rules to
      // the relation standard would silently lose the import fill the scan
      // produced. Guard-free rules keep the full relation check.
      if (
        refs !== undefined &&
        (refs.guardCount > 0 || isBaseToMarkedRemap(ir, refs.baseRef, refs.markedRef))
      ) {
        return {
          axis: "markInputOrder",
          value: "postfix",
          source: "import-derived",
        };
      }
    }
  }
  return undefined;
}
