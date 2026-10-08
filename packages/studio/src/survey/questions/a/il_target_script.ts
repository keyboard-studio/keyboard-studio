// Per-question module: il_target_script (identity-lite)
// Ported verbatim from content/flows/identity_lite.yaml.
//
// The chosen script — not the language — drives routing, the A2 axis, base
// suggestion, and the inventory diff (spec §8/§9). CJK/Ethiopic/Hangul are
// stub-gated to il_script_not_supported consistent with §9 three-group routing.

import type { QuestionModule, ValidationResult } from "../../types.ts";
import type { ExtractContext } from "../../../decisions/extractContext.ts";

const VALID_SCRIPT_VALUES = new Set([
  "Latn", "romanization-Latn", "fonipa",
  "Arab", "Hebr", "Deva", "Cyrl", "Grek", "Geor", "Armn",
  "Ethi", "Hani", "Hang", "other",
]);

export const definition = {
  id: "il_target_script",
  prompt: "Which script will THIS keyboard type?",
  audit_label: "Keyboard script",
  help_text:
    "Choose the writing system this keyboard produces. It can differ from the " +
    "script your language normally uses: pick \"Latin romanization\" or \"IPA\" if " +
    "you are building a romanized or phonetic keyboard. The script you choose " +
    "here — not the language — decides the keyboard's layout family.",
  type: "select" as const,
  required: true,
  options: [
    { value: "Latn", label: "Latin (A–Z and accented letters like é, ñ, ŋ)" },
    { value: "romanization-Latn", label: "Latin romanization (the keyboard produces Latin letters A–Z and diacritics)" },
    { value: "fonipa", label: "IPA — phonetic transcription (Latin-based)" },
    { value: "Arab", label: "Arabic" },
    { value: "Hebr", label: "Hebrew" },
    { value: "Deva", label: "Devanagari (Hindi, Nepali, Marathi, and others)" },
    { value: "Cyrl", label: "Cyrillic (Russian, Ukrainian, Serbian, and others)" },
    { value: "Grek", label: "Greek" },
    { value: "Geor", label: "Georgian" },
    { value: "Armn", label: "Armenian" },
    { value: "Ethi", label: "Ethiopic (Ge'ez, Amharic, Tigrinya — not yet supported)" },
    { value: "Hani", label: "Chinese / Japanese Han characters (not yet supported)" },
    { value: "Hang", label: "Hangul (Korean — not yet supported)" },
    { value: "other", label: "Another script not listed here" },
  ],
  next: [
    { condition: "value == 'Ethi' or value == 'Hani' or value == 'Hang'", goto: "il_script_not_supported" },
    // #1901: NO default branch — a supported script ENDS the identity
    // flow here. Attribution capture (il_author_name → …) used to be this
    // edge's target (spec 064 US1); the author/copyright questions now
    // live in the post-track `attribution` flow, because what they
    // propose depends on the track. A gated script still terminates on
    // the notice above — an author who cannot make a keyboard is never
    // asked who holds its copyright (the session's "unsupported"
    // terminal enforces the same fact one layer up).
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value[0] ?? ""
      : "";

  if (v.length === 0) {
    return { ok: false, code: "required", message: "Please select a writing system." };
  }
  if (!VALID_SCRIPT_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a recognised script option.` };
  }
  return { ok: true };
}

// mutate: STUB — KeyboardIR mutation surface is not yet a real contract.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Latn", note: "Latin script — routes to default (null terminal)" },
    { value: "fonipa", note: "IPA — routes to default (null terminal)" },
    { value: "romanization-Latn", note: "Latin romanization" },
    { value: "Ethi", note: "Ethiopic — routes to il_script_not_supported" },
    { value: "Hani", note: "Han — routes to il_script_not_supported" },
    { value: "Hang", note: "Hangul — routes to il_script_not_supported" },
    { value: "other", note: "catch-all option" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "xxxx", expectedCode: "invalid_option", note: "unknown script code" },
  ],
};

// Output reach (spec 059 FR-016): `writes` stays `[]` — this question writes no
// KeyboardIR — while `outputs` states that the answer nevertheless reaches an
// emitted artifact. Here, the answer contributes the script/variant subtag to the
// composed tag the descriptor declares.
// Decision spike (km/decisions-spike): base-keyboard probe AND the single
// system answering "what script did the base decide" (spec 087 Q2 — the
// adaptation catalog reads posture via extractBaseScriptPosture below). Reads the script from the catalog entry — the codec leaves the
// IR header's bcp47 empty on real catalog imports, so the catalog is
// primary and the IR header is a fallback. Only ISO 15924 script codes
// this question offers are extractable — "romanization-Latn", "fonipa",
// and "other" cannot be determined from metadata alone, so those (and
// absent metadata) yield undefined and the author is asked.
const EXTRACTABLE_SCRIPTS = new Set([
  "Latn", "Arab", "Hebr", "Deva", "Cyrl", "Grek", "Geor", "Armn",
  "Ethi", "Hani", "Hang",
]);

export function extractTargetScript(ctx: ExtractContext): string | undefined {
  // Catalog first: the codec leaves the IR header's bcp47 empty on real
  // catalog imports. Only script codes this question offers are extractable.
  const catalogScript = ctx.catalog?.script;
  if (catalogScript !== undefined && EXTRACTABLE_SCRIPTS.has(catalogScript)) {
    return catalogScript;
  }
  const tag = ctx.ir?.header.bcp47[0];
  if (!tag) return undefined;
  const script = tag.split("-").find((s) => /^[A-Z][a-z]{3}$/.test(s));
  return script !== undefined && EXTRACTABLE_SCRIPTS.has(script) ? script : undefined;
}

/**
 * The base's script posture, as read by every consumer (the adaptation
 * catalog's q_sa2 predicate, the default posture builder). This is extraction
 * provenance of the target-script decision: the one place a script
 * distribution becomes "single-script" or "mixed".
 */
export interface BaseScriptPosture {
  posture: "single-script" | "mixed";
  /** Largest-share script subtag ("" when the distribution is empty). */
  dominantScript: string;
  dominantShare: number;
  /** Human-readable provenance that NAMES the threshold policy. */
  provenance: string;
}

/**
 * Classify a base's script distribution against the single-script threshold.
 * The sole implementation of that policy: a dominant share at or above
 * `singleScriptThreshold` is single-script, anything below is mixed. Pure.
 */
export function extractBaseScriptPosture(
  distribution: Record<string, number>,
  singleScriptThreshold: number,
): BaseScriptPosture {
  let dominantScript = "";
  let dominantShare = 0;
  for (const [script, share] of Object.entries(distribution)) {
    if (share > dominantShare) {
      dominantScript = script;
      dominantShare = share;
    }
  }
  const posture = dominantShare >= singleScriptThreshold ? "single-script" : "mixed";
  const pct = Math.round(singleScriptThreshold * 100);
  const sharePct = Math.round(dominantShare * 100);
  const provenance =
    posture === "single-script"
      ? `${dominantScript} is ${sharePct}% of base rules, at or above the single-script threshold (${pct}%)`
      : `no script reaches the single-script threshold (${pct}%)`;
  return { posture, dominantScript, dominantShare, provenance };
}

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], outputs: [{ target: "package-descriptor", field: "bcp47" }],
  // Decision spike (km/decisions-spike).
  provides: ["target-script"],
  requires: ["language-code"],
  extract: extractTargetScript,
  // Spec 092 (T033): the resolved langtags entry's script (already mapped
  // to a target-script option value at resolution time) as a lookup default.
  lookupDefault: (ctx) => {
    const script = ctx.identity?.targetScript;
    return script !== undefined && script !== "" ? { value: script, source: "langtags" } : undefined;
  },
};
export default mod;
