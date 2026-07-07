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
// exemplar): `any(equalD) + "=" > index(equalU,1)` — an already-produced base
// character (any() over a base-output store, NOT a deadkey) followed by a
// single literal diacritic-trigger key, collapsing to the marked form via
// index(). The base is typed first and the mark-trigger second: postfix.
//
// SCOPE (spec §7.2 rule 3a): this detects the *unconditional* postfix shape
// only. The live sil_ipa postfix rules are all `if(option_key=…)`-guarded, and
// the codec classifies any `if(...)` context as opaque (parse.ts →
// IF_OPTION_STORE), so guarded rules become RawKmnFragments and never reach
// group.rules. They are therefore invisible here until the codec's if()-guard
// handling is scoped separately. In real sil_ipa the guard-free variants
// (offset 1) are all commented out, so no currently-shipping sil_ipa rule is
// reachable through this path today; it fires on any live guard-free postfix
// rule wherever one exists.

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
 * `any(equalD) + "=" > index(equalU,1)` parses to context
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
  // Alignment invariant: the index() offset must point at the any()'s position
  // in the context. Unlike the S-02 fan-out shape (any() *terminal*, so
  // offset === context.length; see isParallelIndexFanOut), here any() *leads*,
  // so its 1-based position — and the required offset — is 1. The real
  // guard-free sil_ipa rule confirms this: `any(equalD) + "=" > index(equalU,1)`.
  // (Offset 2 only appears on the `if(…)`-guarded variants, where the guard
  // occupies position 1 — but those are opaque at parse time; see the module
  // header.)
  return out.offset === 1;
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
 * never selects S-03. Narrowing the fill itself (e.g. by diacritic store
 * content) is a tracked follow-up, not done here.
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
