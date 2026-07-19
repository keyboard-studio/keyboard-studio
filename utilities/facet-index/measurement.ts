/**
 * Shared measurement assembly for the construction classifiers (spec 041 US1,
 * T006; contract measurement-model.md; FR-001/005/006).
 *
 * Every desktop construction classifier reduces its keyboard to a list of
 * ANALYZED SITES (each carrying the facet value it exhibits), then hands them
 * here. This module computes the one shape they all share — dominant value +
 * consistency + per-cause-tag summary — identically, so consistency arithmetic,
 * the opaque-exclusion rule, the lexicographic tie-break, and cause tagging live
 * in one place, not forked nine ways.
 *
 * It also owns the two other first-class states a construction facet can hold:
 *   - `notApplicableMeasurement` — the facet does not apply (caseless →
 *     caps-handling, abugida/abjad → normalization, no touch layout → touch).
 *     A determinate finding, `content-derived`, never a forced value (R3).
 *   - `deriveScriptContext` — the shared `ClassifierContext` (script family +
 *     casing), computed once from the `script` classifier's output so the
 *     cause-predicate guards and the not-applicable gates read the same identity
 *     the `script` facet ships (reused, not re-derived — spec Assumption).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

import { classifyScript } from "./script-classifier.js";
import { scriptOf, scriptExtensionsOf } from "./ucd/generated/scriptLookup.js";
import { mapImportStatus, computeAnalyzedCoverage } from "./outcome.js";
import { tagExceptionSet, type CausePredicate } from "./cause-predicates.js";
import type {
  Categorization,
  CauseTag,
  ClassifierContext,
  ConfidenceClass,
  ExceptionSite,
  FacetDefinition,
} from "./types.js";

/** A single analyzed site a construction classifier reduces its keyboard to. */
export interface AnalyzedSite {
  /** Deterministic, human-auditable locator (rule/store index, layer key, …). */
  location: string;
  /** The facet value this site exhibits — drives dominant + consistency. */
  value: string;
  /**
   * Optional content signal for the cause predicates (e.g. the deviating
   * characters, for the `character-class` combining-mark test). Defaults to
   * `value`; set it when a facet's cause tagging depends on the literal content
   * rather than the facet-value token.
   */
  observed?: string;
}

export interface MeasurementInput {
  /** Analyzed sites — the caller has already EXCLUDED opaque regions (Edge Case). */
  sites: AnalyzedSite[];
  ctx: ClassifierContext;
  /** The IR, for `analyzedCoverage` (opaque share) + `analysisOutcome`. */
  ir: KeyboardIR;
  /**
   * Force the dominant value instead of taking the plurality (e.g. a facet that
   * classifies "none" when there are no sites). Omit for plurality.
   */
  dominant?: string;
  notes?: string;
  /**
   * When the analyzed sites carry more than one distinct value, report this
   * value instead of the plurality (e.g. a facet's explicit `mixed` member).
   * The consistency + `causeTagCounts` still describe HOW mixed (they are
   * computed against the plurality dominant). Omit for single-shape facets.
   */
  mixedValue?: string;
  /** Override the cause-predicate library (tests only). */
  predicates?: readonly CausePredicate[];
}

const CONFIDENT_CONSISTENCY = 0.8;

/**
 * Plurality value over the analyzed sites; lexicographic tie-break for
 * determinism (FR-006). Undefined when there are no sites.
 */
function pluralityValue(sites: AnalyzedSite[]): string | undefined {
  const counts = new Map<string, number>();
  for (const s of sites) counts.set(s.value, (counts.get(s.value) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = -1;
  for (const key of [...counts.keys()].sort()) {
    const count = counts.get(key)!;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function classifyConfidence(consistency: number, siteCount: number): ConfidenceClass {
  if (siteCount === 0) return "undetermined";
  if (consistency >= CONFIDENT_CONSISTENCY) return "confident";
  return "mixed";
}

/**
 * Assemble the standard construction-facet `Categorization` from analyzed sites.
 * `consistency = matchingSites / analyzedSites`; `consistency === 1` ⟹ no
 * exception sites and no cause predicates run (Edge Case); otherwise the ordered
 * cause-predicate library tags the whole exception set and `causeTagCounts`
 * summarizes it (FR-002/005). Returns a value within the facet's limits by
 * construction (each site's `value` is one the classifier chose from the set).
 */
export function assembleMeasurement(input: MeasurementInput): Categorization {
  const { sites, ctx, ir } = input;
  const analyzedSites = sites.length;
  const dominant = input.dominant ?? pluralityValue(sites);

  const matchingSites = dominant === undefined ? 0 : sites.filter((s) => s.value === dominant).length;
  const consistency = analyzedSites === 0 ? 1 : matchingSites / analyzedSites;

  const exceptions: ExceptionSite[] =
    dominant === undefined
      ? []
      : sites
          .filter((s) => s.value !== dominant)
          .map((s) => ({
            location: s.location,
            observedValue: s.observed ?? s.value,
            causeTag: "gap-omission" as CauseTag,
          }));

  let causeTagCounts: Partial<Record<CauseTag, number>> | undefined;
  if (exceptions.length > 0) {
    const tag = tagExceptionSet(exceptions, ctx, input.predicates) ?? "gap-omission";
    causeTagCounts = { [tag]: exceptions.length };
  }

  // A facet with an explicit `mixed` member reports it when the sites disagree;
  // the consistency/causeTagCounts above still describe the split (FR-001).
  const distinctValues = new Set(sites.map((s) => s.value)).size;
  const value = input.mixedValue !== undefined && distinctValues > 1 ? input.mixedValue : dominant;

  const status = ir.raw.length > 0 ? ImportStatus.CleanWithOpaque : ImportStatus.Clean;

  return {
    value,
    confidence: null, // consistency carries the likelihood for a single value
    confidenceClass: classifyConfidence(consistency, analyzedSites),
    provenanceTier: "content-derived",
    evidenceSize: analyzedSites,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: mapImportStatus(status),
    consistency,
    ...(causeTagCounts ? { causeTagCounts } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

/**
 * The determinate not-applicable state (R3): the facet was read to NOT apply to
 * this keyboard. `value` omitted, `notApplicable: true`, `content-derived` (the
 * n/a was determined from the keyboard's own script/structure), and a `notes`
 * naming the gate. Never `default-fallback`, never a forced value.
 */
export function notApplicableMeasurement(notes: string): Categorization {
  return {
    value: undefined,
    notApplicable: true,
    confidence: null,
    confidenceClass: "undetermined",
    provenanceTier: "content-derived",
    evidenceSize: 0,
    analyzedCoverage: 1, // the n/a was read in full; nothing opaque was missed
    analysisOutcome: "fully",
    notes,
  };
}

/**
 * The honest "undetermined" fallback shared by the construction classifiers
 * whose facet has no declared-metadata tier (fallbackChain: [content-derived,
 * undetermined]) — reached when `classify` found no evidence or `parse()` threw.
 * Mirrors `strategyFingerprintFallback`: value omitted, no fabricated shape,
 * `fallback-only` outcome at a non-content tier (X4-consistent).
 */
export function undeterminedFallback(notes: string): Categorization {
  return {
    value: undefined,
    confidence: null,
    confidenceClass: "undetermined",
    provenanceTier: "default-fallback",
    evidenceSize: 0,
    analyzedCoverage: 0,
    analysisOutcome: "fallback-only",
    notes,
  };
}

// ---------------------------------------------------------------------------
// Shared script context (family + casing), reused from the `script` classifier
// ---------------------------------------------------------------------------

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

/** Does the produced set contain any cased letter (Unicode Cased property)? */
function producesCasedLetter(ir: KeyboardIR): boolean {
  for (const ch of buildProducedSet(ir)) {
    if (/^\p{Lu}$/u.test(ch) || /^\p{Ll}$/u.test(ch)) return true;
  }
  return false;
}

/**
 * The set of concrete ISO-15924 scripts the keyboard's produced characters
 * exclusively attest (mirrors the `script` classifier's pass-1 attestation,
 * ignoring shared/neutral characters). Used to decide `cased`/`caseless`/`mixed`
 * from script identity rather than re-scanning per facet.
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
 * Derive the shared `ClassifierContext` (script family + casing + coverage) once
 * from the keyboard's produced set. `scriptFamily` is the `script` classifier's
 * dominant value (reused). `casing`:
 *   - `mixed`   — the keyboard attests both a cased and a caseless script;
 *   - `cased`   — every attested script is bicameral, or (no attested script but
 *     the output carries cased letters) the content is cased;
 *   - `caseless`— otherwise.
 */
/**
 * A script-agnostic `ClassifierContext` for facets whose cause tagging and gates
 * do not depend on script identity (reordering, rule-store-compaction,
 * fallback-posture, mnemonic-vs-positional). `casing: "caseless"` is the inert
 * default — none of these facets read it — while `analyzedCoverage` still
 * carries the real opaque share so the assembly reports coverage honestly.
 */
export function neutralContext(ir: KeyboardIR): ClassifierContext {
  return { scriptFamily: null, casing: "caseless", analyzedCoverage: computeAnalyzedCoverage(ir) };
}

export function deriveScriptContext(ir: KeyboardIR, scriptDef: FacetDefinition): ClassifierContext {
  const scriptResult = classifyScript(ir, scriptDef);
  const scriptFamily = typeof scriptResult?.value === "string" ? scriptResult.value : null;

  const scripts = attestedScripts(ir);
  const hasCased = [...scripts].some((s) => CASED_SCRIPTS.has(s));
  const hasCaseless = [...scripts].some((s) => !CASED_SCRIPTS.has(s));

  let casing: ClassifierContext["casing"];
  if (hasCased && hasCaseless) {
    casing = "mixed";
  } else if (hasCased) {
    casing = "cased";
  } else if (hasCaseless) {
    casing = "caseless";
  } else {
    // No attested script (e.g. Common/Inherited-only output) — fall back to the
    // Unicode Cased property of the produced set so a purely-symbolic keyboard
    // still reads caseless rather than mis-gating downstream facets.
    casing = producesCasedLetter(ir) ? "cased" : "caseless";
  }

  return { scriptFamily, casing, analyzedCoverage: computeAnalyzedCoverage(ir) };
}
