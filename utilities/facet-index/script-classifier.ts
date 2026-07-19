/**
 * Script classifier (spec 036 T015) — content-derived script categorization
 * from a keyboard's produced-character set.
 *
 * Maps every concretely-scripted character in `buildProducedSet(ir)` to its
 * ISO 15924 script via the pinned UCD lookup (utilities/facet-index/ucd),
 * using a two-pass content-derived attribution (linguist-corrected; replaces
 * the earlier "exactly one script in the extension set" heuristic):
 *
 *  - Pass 1 (attestation): tally only EXCLUSIVE-Script characters — a
 *    concrete (non-Common/Inherited) `Script` value AND no
 *    Script_Extensions set at all — into the histogram. This establishes the
 *    set of scripts the keyboard's content ATTESTS, with their base weights.
 *  - Pass 2 (apportionment): every SHARED character (one carrying a defined
 *    Script_Extensions set, regardless of its own primary Script value —
 *    e.g. an Arabic-Indic digit whose primary is Arab but whose extension
 *    set also names Thaa/Yezi) has its weight of 1 split evenly across only
 *    the scripts in its extension set that are ALREADY attested from pass 1.
 *    A shared character whose extension set intersects no attested script is
 *    NEUTRAL — dropped — because apportioning it would invent attestation
 *    for a script the content never exclusively produced.
 *  - Common (Zyyy) / Inherited (Zinh) characters with no Script_Extensions
 *    are always neutral (no evidence, dropped). Neither literal value ever
 *    becomes a histogram key.
 *
 * Distribution keys still sum to ~1 (each character contributes a total
 * weight of exactly 1, whether wholly in pass 1 or apportioned in pass 2).
 *
 * Internal weighting/thresholds here are an MVP that proves the artifact
 * shape (spec 036 scope note); finer apportionment tuning is spec 037's job.
 *
 * Not wired here: `script.yaml`'s `subProfiles.latin` and the generated
 * `latinProfileOf()` lookup (ucd/generated/scriptLookup.ts) exist so a future
 * facet can classify Latin sub-profile (plain/extended/ipa), but this
 * classifier never populates `Categorization.subProfile` — reserved for spec
 * 037, not a gap in 036's scope (only the `script` facet's dominant-value +
 * distribution ships here).
 */

import { buildProducedSet } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

import { scriptOf, scriptExtensionsOf, latinProfileOf } from "./ucd/generated/scriptLookup.js";
import type { LatinProfile } from "./ucd/generated/scriptLookup.js";
import { mapImportStatus, computeAnalyzedCoverage } from "./outcome.js";
import {
  resolveBaseLayout,
  hasBaseLayerRuleSurface,
  leakedChars,
} from "./base-layout.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";

// The special ISO-15924 pseudo-scripts that are NOT concrete script evidence and
// so are never histogram-eligible (they are excluded from script.yaml's closed
// limits.values). Zyyy (Common) / Zinh (Inherited) carry no script evidence on
// their own; Zzzz (Unknown, `scriptOf`'s @missing default for an unranged/PUA
// codepoint) and Zxxx (Unwritten) are the absence of a concrete script. Emitting
// any of these as a distribution key would fail the build-time limits check (X1),
// which is the point — they are dropped here rather than diluting a distribution.
const NEUTRAL_SCRIPTS = new Set(["Zyyy", "Zinh", "Zzzz", "Zxxx"]);

/**
 * Confidence-class thresholds on the dominant value's distribution share
 * (data-model Entity 3a, tunable): a dominant script holding ≥80% of the
 * concretely-scripted evidence reads as `confident`; a genuinely split
 * distribution as `mixed`. `undetermined` is unreachable on the content tier
 * (zero-evidence keyboards return null before this point and fall through to the
 * fallback chain) but is kept defensively for the degenerate 0-share case.
 */
const CONFIDENT_DOMINANT_SHARE = 0.8;

function classifyConfidence(dominantShare: number): ConfidenceClass {
  if (dominantShare >= CONFIDENT_DOMINANT_SHARE) return "confident";
  if (dominantShare > 0) return "mixed";
  return "undetermined";
}

/**
 * Latin-specific evidence floor (share of Latin-scripted produced characters
 * carrying a richer profile) needed to promote the sub-profile hint from
 * `plain`. A hint, not an orthography claim (data-model FR-010).
 *
 * The `ipa` bar is deliberately higher than `extended` and must additionally
 * beat `extended` by a margin (km-domain review, 037): many everyday letters in
 * African Latin-script orthographies — ɛ U+025B, ɔ U+0254, ɖ U+0256 (Ewe, Fon/Gbe,
 * Akan/Twi, Ga), ɓ U+0253 (Fula, Hausa, Mandinka), ɣ U+0263 (Fon, Fula, Wolof,
 * Tamazight) — live in the IPA Extensions block purely by
 * Unicode accident, not because the keyboard is for phonetic transcription. An
 * orthography keyboard that mixes those with true Latin-Extended letters (ŋ, ƒ)
 * must read as `extended`, not `ipa`; only a keyboard where IPA-block characters
 * genuinely dominate (a transcription keyboard) promotes to `ipa`.
 */
const LATIN_EXTENDED_FLOOR = 0.15;
const LATIN_IPA_FLOOR = 0.3;
/** `ipa` must beat `extended`'s share by at least this to win over the orthography reading. */
const LATIN_IPA_MARGIN = 0.15;
/** Below this many Latin-scripted produced chars, a richer-than-plain hint is just sample noise. */
const LATIN_MIN_EVIDENCE = 4;

/**
 * Derive the Latin sub-profile hint {plain, extended, ipa} from the produced
 * set, using the block-derived `latinProfileOf` lookup over the characters that
 * resolve to the Latin script. Promotes to `ipa` only when IPA-block characters
 * both clear their (higher) floor and outweigh Latin-Extended evidence by a
 * margin — otherwise a keyboard carrying any beyond-Basic-Latin evidence reads
 * as `extended`, and a plain keyboard as `plain`. Returns undefined only when
 * the keyboard produced no Latin-scripted characters at all.
 */
function latinSubProfile(produced: Iterable<string>): LatinProfile | undefined {
  let latinTotal = 0;
  let ipa = 0;
  let extended = 0;
  for (const ch of produced) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (scriptOf(cp) !== "Latn") continue;
    const profile = latinProfileOf(cp);
    if (profile === undefined) continue;
    latinTotal += 1;
    if (profile === "ipa") ipa += 1;
    else if (profile === "extended") extended += 1;
  }
  if (latinTotal === 0) return undefined;
  // Too little Latin evidence to promote past the safe `plain` default.
  if (latinTotal < LATIN_MIN_EVIDENCE) return "plain";
  const ipaShare = ipa / latinTotal;
  const extShare = extended / latinTotal;
  // `ipa` wins only when it dominates — clears the higher floor AND beats the
  // orthographic (extended) reading by a margin.
  if (ipaShare >= LATIN_IPA_FLOOR && ipaShare >= extShare + LATIN_IPA_MARGIN) return "ipa";
  // Any meaningful beyond-Basic-Latin evidence (extended letters or IPA-block
  // letters used orthographically) reads as `extended`.
  if (ipaShare + extShare >= LATIN_EXTENDED_FLOOR) return "extended";
  return "plain";
}

/**
 * Content-derived script categorization, or `null` when the produced set has
 * no concretely-scripted output (empty keyboard, or Common/Inherited-only
 * output such as pure digits/punctuation) — the caller falls through to
 * `deriveScriptFallback` (fallback.ts) in that case.
 */
export function classifyScript(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def; // every code this emits is a concrete Scripts.txt script (neutrals dropped),
  // which is within script.yaml's closed limits.values by construction; the build-time
  // limits check (validate.ts, X1) is the enforcing gate on that invariant.

  const produced = buildProducedSet(ir);
  const histogram = new Map<string, number>();
  const attested = new Set<string>();
  const sharedCodepoints: number[] = [];
  let evidenceSize = 0;

  // Pass 1: exclusive-Script characters (concrete primary, no
  // Script_Extensions at all) establish the attested-scripts set.
  for (const ch of produced) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;

    const extensions = scriptExtensionsOf(cp);
    if (extensions !== undefined) {
      // Shared character — deferred to pass 2 regardless of its own primary
      // Script value.
      sharedCodepoints.push(cp);
      continue;
    }

    const primary = scriptOf(cp);
    if (NEUTRAL_SCRIPTS.has(primary)) continue; // Zyyy/Zinh, unshared: no evidence.

    histogram.set(primary, (histogram.get(primary) ?? 0) + 1);
    attested.add(primary);
    evidenceSize += 1;
  }

  // Pass 2: apportion each shared character's weight only across the scripts
  // in its extension set that are already attested from pass 1.
  for (const cp of sharedCodepoints) {
    const extensions = scriptExtensionsOf(cp)!;
    const matched = extensions.filter((s) => attested.has(s));
    if (matched.length === 0) continue; // intersects no attested script: neutral.

    const weight = 1 / matched.length;
    for (const script of matched) {
      histogram.set(script, (histogram.get(script) ?? 0) + weight);
    }
    evidenceSize += 1;
  }

  if (evidenceSize === 0 || histogram.size === 0) return null;

  const total = [...histogram.values()].reduce((a, b) => a + b, 0);
  const distribution: Record<string, number> = {};
  for (const [script, count] of histogram) {
    distribution[script] = count / total;
  }

  let dominantScript = "";
  let dominantCount = -1;
  for (const [script, count] of histogram) {
    if (count > dominantCount) {
      dominantScript = script;
      dominantCount = count;
    }
  }

  // --- Dominant value + confidence class are the RULE-PRODUCED source of
  // truth. They are frozen HERE, before the base-layout fall-through fold below,
  // and are never re-derived from the post-fold histogram (spec 040 FR-004,
  // contract §2.3): a distribution-only sliver must never vote for the dominant
  // value or worsen the confidence class. Do not move these two after the fold.
  const value = dominantScript;
  const confidenceClass = classifyConfidence(dominantCount / total);

  // --- Desktop base-layout fall-through fold (spec 040) ---------------------
  // On desktop, a physical key the keyboard does not name falls through to the
  // OS base layout (`kbdus`), emitting a small Latin sliver the rule-only
  // histogram misses. Fold those leaked characters into the DISTRIBUTION only
  // (dominant/confidence already frozen above). No-op when the IR has no
  // base-layer rule surface (touch-only — where `leakedChars` would otherwise
  // report the full alphabet) or when nothing leaks (fully remapped / all
  // `> nul`), so those records stay byte-identical to the pre-040 baseline.
  let distributionOut = distribution;
  let evidenceSizeOut = evidenceSize;
  let notes: string | undefined;
  if (hasBaseLayerRuleSurface(ir)) {
    const leaked = leakedChars(ir);
    if (leaked.length > 0) {
      const foldHist = new Map(histogram);
      let foldEvidence = evidenceSize;
      for (const ch of leaked) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        const script = scriptOf(cp);
        if (NEUTRAL_SCRIPTS.has(script)) continue; // defensive: a-z are all Latn
        foldHist.set(script, (foldHist.get(script) ?? 0) + 1);
        foldEvidence += 1;
      }
      const foldTotal = [...foldHist.values()].reduce((a, b) => a + b, 0);
      const foldDist: Record<string, number> = {};
      for (const [script, count] of foldHist) foldDist[script] = count / foldTotal;
      distributionOut = foldDist;
      evidenceSizeOut = foldEvidence;

      const { branchesOn } = resolveBaseLayout(ir);
      notes =
        branchesOn.length > 0
          ? `base-layout: kbdus (default); branches-on: ${branchesOn.join(",")}`
          : "base-layout: kbdus (default)";
    }
  }

  // TODO(037): thread the real opaque signal from `ParseResult.opaqueFeatures`
  // instead of re-deriving it from `ir.raw.length` here. Doing so now would
  // widen `classifyScript`'s pinned signature (KeyboardIR -> ParseResult),
  // which also touches `ClassifierPair` in build-index.ts and every test
  // fixture that calls `classifyScript(ir, def)` directly — deferred as
  // out-of-scope for this pass.
  const status = ir.raw.length > 0 ? ImportStatus.CleanWithOpaque : ImportStatus.Clean;

  // Latin sub-profile hint (FR-010) — only meaningful when Latin is dominant.
  const latin = dominantScript === "Latn" ? latinSubProfile(produced) : undefined;

  return {
    value,
    distribution: distributionOut,
    confidence: null, // the distribution carries the likelihood
    confidenceClass,
    provenanceTier: "content-derived",
    evidenceSize: evidenceSizeOut,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: mapImportStatus(status),
    ...(notes !== undefined ? { notes } : {}),
    ...(latin !== undefined ? { subProfile: { latin } } : {}),
  };
}
