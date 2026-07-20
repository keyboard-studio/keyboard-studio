/**
 * Orthography-coverage-ratio classifier (spec 043 US2, T032) — character-content
 * archetype.
 *
 * How much of a target orthography's everyday letters the base can already
 * produce: the fraction of the CLDR main `exemplarCharacters` set (for the base's
 * declared BCP47 tag) that appears in the base's produced-character set (FR-023,
 * data-model). A `keyboard.*` facet (no session mirror).
 *
 * The exemplar reference is the pinned in-repo snapshot `data/cldr-exemplars.json`
 * (research Decision 5), sha256-pinned in `data/SOURCES.json` — no network, no
 * npm CLDR dependency (FR-004). When the declared tag's language has NO entry in
 * the snapshot, the facet records the honest `not-derivable` sentinel — DISTINCT
 * from a 0.0 ratio (which means "reference exists, base covers none"): never a
 * guessed coverage (SC-004).
 *
 * `value` is the summary ratio (0.0–1.0) or the `not-derivable` string; the
 * missing-character set is recorded in `notes` (the per-site enumeration is
 * recomputable and never a stored value). Comparison is on NFC-normalized single
 * characters; a base that inputs a letter only as base+combining (never the
 * precomposed exemplar form) will read as not covering it — a known, documented
 * limitation of a character-set measure.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { hasBaseLayerRuleSurface, leakedChars } from "./base-layout.js";
import { readKpsPackage } from "./kps-reader.js";
import { undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXEMPLARS_PATH = resolve(HERE, "data", "cldr-exemplars.json");

/** The honest sentinel for "no CLDR exemplar set exists for this tag" (≠ 0.0). */
export const NOT_DERIVABLE = "not-derivable";

interface ExemplarSnapshot {
  cldrVersion: string;
  locales: Record<string, string[]>;
}

let cachedExemplars: ExemplarSnapshot | undefined;

function loadExemplars(): ExemplarSnapshot {
  if (cachedExemplars !== undefined) return cachedExemplars;
  cachedExemplars = JSON.parse(readFileSync(EXEMPLARS_PATH, "utf8")) as ExemplarSnapshot;
  return cachedExemplars;
}

/**
 * The exemplar character set for a declared BCP47 tag, or null when the snapshot
 * has no entry. Tries the full tag lowercased, then the language subtag alone
 * (e.g. `fr-FR` → `fr`), so a region/script-qualified tag still resolves.
 */
function exemplarsFor(tag: string, snapshot: ExemplarSnapshot): string[] | null {
  const lower = tag.toLowerCase();
  if (snapshot.locales[lower]) return snapshot.locales[lower];
  const lang = lower.split("-")[0]!;
  if (snapshot.locales[lang]) return snapshot.locales[lang];
  return null;
}

/** The base's produced-character set, NFC-normalized, with the spec-040 fall-through fold. */
function producedNfcSet(ir: KeyboardIR): Set<string> {
  const produced = new Set<string>();
  for (const ch of buildProducedSet(ir)) produced.add(ch.normalize("NFC"));
  if (hasBaseLayerRuleSurface(ir)) {
    for (const ch of leakedChars(ir)) produced.add(ch.normalize("NFC"));
  }
  return produced;
}

/**
 * Content-derived orthography coverage ratio, or `not-derivable` when no declared
 * tag resolves to a CLDR exemplar set. Returns null only when the base produces
 * nothing at all (empty/opaque-only) so the caller falls through to the fallback.
 * Never throws.
 */
export function classifyOrthographyCoverageRatio(
  ir: KeyboardIR,
  def: FacetDefinition,
  kb: ScannedKeyboard,
): Categorization | null {
  void def;

  const produced = producedNfcSet(ir);
  if (produced.size === 0) return null; // nothing produced — fall through.

  const snapshot = loadExemplars();
  const tags = readKpsPackage(kb).languageTags;

  let matchedTag: string | null = null;
  let exemplars: string[] | null = null;
  for (const tag of tags) {
    const found = exemplarsFor(tag, snapshot);
    if (found) {
      matchedTag = tag;
      exemplars = found;
      break;
    }
  }

  const baseFields = {
    confidence: null,
    provenanceTier: "content-derived" as const,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: (ir.raw.length > 0 ? "partially" : "fully") as Categorization["analysisOutcome"],
  };

  if (exemplars === null) {
    // No exemplar set for any declared tag — honest not-derivable (≠ 0.0).
    return {
      ...baseFields,
      value: NOT_DERIVABLE,
      confidenceClass: "undetermined",
      evidenceSize: 0,
      notes:
        tags.length > 0
          ? `no CLDR exemplar set (v${snapshot.cldrVersion}) for declared tag(s) ${tags.join(", ")}; coverage not-derivable`
          : `no declared BCP47 tag; coverage not-derivable`,
    };
  }

  const exemplarSet = new Set(exemplars.map((c) => c.normalize("NFC")));
  const missing: string[] = [];
  let covered = 0;
  for (const ch of exemplarSet) {
    if (produced.has(ch)) covered += 1;
    else missing.push(ch);
  }
  const ratio = covered / exemplarSet.size;
  missing.sort();

  return {
    ...baseFields,
    value: ratio,
    confidenceClass: "confident",
    evidenceSize: exemplarSet.size,
    consistency: 1,
    notes:
      missing.length > 0
        ? `${covered}/${exemplarSet.size} of ${matchedTag} exemplars covered (CLDR v${snapshot.cldrVersion}); missing: ${missing.join("")}`
        : `${covered}/${exemplarSet.size} of ${matchedTag} exemplars covered (CLDR v${snapshot.cldrVersion}); full coverage`,
  };
}

/**
 * Fallback: the base produces nothing (empty/opaque-only) or `parse()` threw.
 * Coverage is a content-derived measurement, so this is an honest `undetermined`
 * (not a fabricated ratio).
 */
export function orthographyCoverageRatioFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no produced characters (empty/opaque-only or parse failure); orthography coverage undetermined");
}
