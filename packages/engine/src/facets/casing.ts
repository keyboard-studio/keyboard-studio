// Casing facet derivation (spec 048, FR-002/FR-007/FR-008).
//
// The SINGLE shared implementation of "is this keyboard's produced content
// cased, caseless, or mixed" — script-identity driven, not rule-structure
// driven. Reused, not duplicated, by:
//   - the runtime working-copy facet (facets/accessors.ts, this feature), and
//   - the offline utilities/facet-index build tool's `casing` facet, via
//     measurement.ts's `deriveScriptContext`, which delegates its casing
//     branch to `deriveCasingFacet` below instead of reimplementing it
//     (FR-008: no second, divergent implementation).
//
// Ported verbatim from utilities/facet-index/measurement.ts's prior
// deriveScriptContext casing branch. The pinned UCD script-identity data
// (./generated/scriptLookup.ts) is emitted in lockstep with the offline
// tool's own copy by the shared utilities/facet-index/ucd/codegen-ucd.mjs
// run, so the two artifacts cannot disagree on what script a codepoint
// belongs to.
//
// Browser-safe: no network/fs access, pure functions over KeyboardIR +
// generated UCD data (FR-007).

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { scriptOf, scriptExtensionsOf } from "./generated/scriptLookup.js";

export type CasingValue = "cased" | "caseless" | "mixed";

/**
 * ISO-15924 codes for the major bicameral (cased) scripts. Latin/Cyrillic/Greek
 * are the families the construction facets centre on; the rest are the other
 * established bicameral scripts so a keyboard for them reads as `cased` too. All
 * other scripts (Arabic, Hebrew — abjad; Devanagari, Bengali — abugida; CJK, …)
 * are caseless.
 */
const CASED_SCRIPTS = new Set([
  "Latn", "Cyrl", "Grek", "Armn", "Copt", "Glag", "Dsrt", "Adlm",
  "Cher", "Osge", "Vith", "Wcho", "Medf", "Gara",
]);
// Cherokee (Cher) is deliberately included here for consistency with the
// existing accepted-gap precedent in
// packages/studio/src/editors/assignLoop/casePairCompanion.ts, whose
// suppression of Unicode-bicameral-but-orthographically-unicameral scripts
// (via packages/studio/src/lib/casePairSuppression.ts's
// isOrthographicallyUnicameral) excludes ONLY Georgian, on real corpus
// evidence; Cherokee is explicitly documented there as "NOT suppressed" and
// left as a known, accepted v1 gap rather than a decision made here.
//
// Vithkuqi/Wancho/Medefaidrin/Garay (Vith/Wcho/Medf/Gara — recent Unicode
// 12-16 bicameral additions) have no established orthographic-convention
// evidence either way in this codebase or the keyboard corpus, unlike
// Georgian (corpus-backed exclusion) or Cherokee (explicitly-documented
// accepted inclusion). Their presence here is Unicode's Cased property taken
// at face value, not a considered decision — flagged as an open question for
// whoever adds real corpus evidence, not resolved by this comment.

/** Does the produced set contain any cased letter (Unicode Cased property)? */
function producesCasedLetter(ir: KeyboardIR): boolean {
  for (const ch of buildProducedSet(ir)) {
    if (/^\p{Lu}$/u.test(ch) || /^\p{Ll}$/u.test(ch)) return true;
  }
  return false;
}

/**
 * The set of concrete ISO-15924 scripts the keyboard's produced characters
 * exclusively attest (mirrors the offline `script` classifier's pass-1
 * attestation, ignoring shared/neutral characters).
 */
function attestedScripts(ir: KeyboardIR): Set<string> {
  const scripts = new Set<string>();
  for (const ch of buildProducedSet(ir)) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (scriptExtensionsOf(cp) !== undefined) continue; // shared → skip (pass-2 territory)
    const primary = scriptOf(cp);
    if (primary === "Zyyy" || primary === "Zinh" || primary === "Zzzz" || primary === "Zxxx") continue;
    scripts.add(primary);
  }
  return scripts;
}

/**
 * Derive the keyboard's `casing` facet value from its produced character set:
 *   - `mixed`   — the keyboard attests both a cased and a caseless script;
 *   - `cased`   — every attested script is bicameral, or (no attested script
 *     but the output carries cased letters) the content is cased;
 *   - `caseless`— otherwise.
 *
 * Always returns a concrete value — callers that need an "undetermined" state
 * for a keyboard with no produced characters at all (spec 048 Edge Case)
 * apply that gate themselves (see facets/accessors.ts `deriveFacets`), the
 * same way the offline `casing` classifier does before ever calling this.
 */
export function deriveCasingFacet(ir: KeyboardIR): CasingValue {
  const scripts = attestedScripts(ir);
  const hasCased = [...scripts].some((s) => CASED_SCRIPTS.has(s));
  const hasCaseless = [...scripts].some((s) => !CASED_SCRIPTS.has(s));

  if (hasCased && hasCaseless) return "mixed";
  if (hasCased) return "cased";
  if (hasCaseless) return "caseless";
  // No attested script (e.g. Common/Inherited-only output) — fall back to the
  // Unicode Cased property of the produced set so a purely-symbolic keyboard
  // still reads caseless rather than mis-gating downstream facets.
  return producesCasedLetter(ir) ? "cased" : "caseless";
}
