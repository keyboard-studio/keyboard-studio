// see spec.md §7.2 rule 3a — base-derived A3a (mark-input order) detection on
// the Track 2 import path.
//
// Complements the script-class default-fill prior (default-fill.ts), which
// deliberately never fills markInputOrder="postfix" (that prior can only ever
// justify the unmarked "prefix" state from script class alone). This module
// supplies the other legitimate source of a postfix value: real structural
// evidence in an imported base's KeyboardIR that the keyboard already uses
// letter-then-mark sequence-replace rules.
//
// Reference shape (release/sil/sil_ipa/source/sil_ipa.kmn, the §7.5 IPA
// exemplar): `any(equalD) + "=" > index(equalU,2)` — an already-produced base
// character (any() over a base-output store, NOT a deadkey) followed by a
// single literal diacritic-trigger key, collapsing to the marked form via
// index(). The base is typed first and the mark-trigger second: postfix.

import type { AxisFill, IRRule, KeyboardIR } from "@keyboard-studio/contracts";

/**
 * True iff `rule` has the postfix sequence-replace shape described above:
 * [any(store), char] > index(store, N). This is the letter-then-mark mirror
 * of the S-02 `[dk(D), any(BASE)] > index(OUT, 2)` body shape — no deadkey
 * involved, and the any() comes first rather than last.
 *
 * The codec preserves a structural inline `+` as a `{kind:"raw", text:"+"}`
 * context element when it falls after real pre-context rather than leading
 * the rule (see emit.ts's `hasInlinePlus`) — e.g. the real sil_ipa source
 * `any(equalD) + "=" > index(equalU,2)` parses to context
 * `[any(equalD), raw("+"), char("=")]`. Strip it before inspecting shape.
 */
function isPostfixMarkSequence(rule: IRRule): boolean {
  const real = rule.context.filter((el) => !(el.kind === "raw" && el.text.trim() === "+"));
  if (real.length !== 2) return false;
  const base = real[0];
  const trigger = real[1];
  if (base === undefined || base.kind !== "any") return false;
  if (trigger === undefined || trigger.kind !== "char") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "index") return false;
  // Alignment invariant (mirrors isParallelIndexFanOut): the index() offset
  // must equal the real match length so any() and the index() output refer
  // to the same position in their respective stores.
  return out.offset === real.length;
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
 * @see spec.md §7.2 rule 3a
 */
export function detectMarkInputOrderFromImport(ir: KeyboardIR): AxisFill | undefined {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (isPostfixMarkSequence(rule)) {
        return { axis: "markInputOrder", value: "postfix", source: "import-derived" };
      }
    }
  }
  return undefined;
}
