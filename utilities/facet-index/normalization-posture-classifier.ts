/**
 * Normalization-posture classifier (spec 041 US1, T016) — rule-structure.
 *
 * Value ∈ {nfc, nfd, mixed}. Meaningful only for the alphabetic scripts where
 * both a precomposed and a decomposed form exist (Latin, Cyrillic, Greek) — for
 * abugida/abjad and every other family it is recorded `notApplicable` (FR-014,
 * AS-5), never a forced `nfc`/`nfd`.
 *
 * Per accented output literal: written decomposed (base + combining marks) →
 * `nfd`; written precomposed → `nfc`. Plain output with no NFC/NFD distinction
 * contributes no site. The combining marks of an `nfd` deviation are recorded as
 * the site's `observed` content, so on a Latin/Cyrillic/Greek keyboard the
 * `character-class` cause predicate can tag a base/combining split as
 * `principled-split` rather than a gap. The backspace-match signal is layered as
 * consistency/exception data, not a distinct value (FR-014).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { assembleMeasurement, deriveScriptContext, notApplicableMeasurement, undeterminedFallback } from "./measurement.js";
import { eachRule } from "./ir-scan.js";
import type { AnalyzedSite } from "./measurement.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const CASED_ALPHABETIC = new Set(["Latn", "Cyrl", "Grek"]);
const COMBINING_MARK = /\p{M}/u;

/** The char literals a rule outputs, concatenated (index/outs/deadkey ignored). */
function outputLiteral(rule: KeyboardIR["groups"][number]["rules"][number]): string {
  return rule.output
    .map((el) => (el.kind === "char" ? el.value : ""))
    .join("");
}

/** Just the combining marks of a string (for the character-class cause signal). */
function combiningMarksOf(s: string): string {
  return [...s].filter((ch) => COMBINING_MARK.test(ch)).join("");
}

export function classifyNormalizationPosture(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  const ctx = deriveScriptContext(ir, def);
  if (ctx.scriptFamily === null || !CASED_ALPHABETIC.has(ctx.scriptFamily)) {
    return notApplicableMeasurement(
      `script family ${ctx.scriptFamily ?? "undetermined"} has no NFC/NFD distinction; normalization not applicable`,
    );
  }

  const sites: AnalyzedSite[] = [];
  for (const { rule, location } of eachRule(ir)) {
    const literal = outputLiteral(rule);
    if (literal.length === 0) continue;
    const nfc = literal.normalize("NFC");
    const nfd = literal.normalize("NFD");
    if (nfc === nfd) continue; // no accent distinction — no evidence
    if (literal === nfd) {
      // Only the nfd side carries real content (the combining marks): that is
      // the signal the `character-class` cause predicate reads to tag a
      // base/combining split as `principled-split`. An nfc site's default
      // `observed` ("nfc") can never satisfy the combining-marks-only test, so
      // it correctly falls through to `gap-omission` if it ever deviates.
      sites.push({ location, value: "nfd", observed: combiningMarksOf(literal) });
    } else if (literal === nfc) {
      sites.push({ location, value: "nfc" });
    }
    // A literal that is neither exactly NFC nor exactly NFD is left unattributed.
  }

  if (sites.length === 0) {
    // Alphabetic script but no accented output — no posture to read.
    return undeterminedFallback("Latin/Cyrillic/Greek keyboard with no accented output; normalization undetermined");
  }

  return assembleMeasurement({ sites, ctx, ir, mixedValue: "mixed" });
}

export function normalizationPostureFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no rule structure; normalization posture undetermined");
}
