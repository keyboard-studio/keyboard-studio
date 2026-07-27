/**
 * Platform-coverage classifier (spec 043 US1, T012) — declared-metadata archetype.
 *
 * The modality set — a subset of `{desktop, web, touch}` — a base ships for,
 * inferred from the BUNDLED FILE TYPES in the `.kps` `<Files>` list, NOT from a
 * `<Targets>` element (absent in this corpus's `.kps` dialect, verified against
 * `bambara.kps` — research Decision 4). File-type → modality (FR-012, verbatim):
 *
 *   .kmx / .kmn          -> desktop
 *   .js                  -> web
 *   .keyman-touch-layout -> touch
 *
 * OS-level labels (windows/macOS/Linux/iOS/Android) are NEVER emitted — file
 * presence cannot distinguish them, so an OS label would be fabrication. A
 * `.keyman-touch-layout` is a source sibling (not a package `<Files>` entry in
 * this corpus), so `touch` is added when either the `<Files>` list names one OR
 * the scanner collected the sibling artifact (reusing `findTouchLayoutSource`).
 *
 * No content-derived tier: none of this lives in the parsed rule IR, so
 * `classifyPlatformCoverage` always returns null and the build routes every base
 * through `platformCoverageFallback`, which reads the scanned `.kps`.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { readKpsPackage } from "./kps-reader.js";
import { findTouchLayoutSource } from "./touch-layout.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

type Modality = "desktop" | "web" | "touch";

/**
 * Content tier is intentionally empty — modality is bundled-file metadata, not
 * rule IR. Always returns null so the build routes to the fallback path.
 */
export function classifyPlatformCoverage(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void ir;
  void def;
  return null;
}

/**
 * Platform-coverage categorization from the `.kps` `<Files>` list unioned with
 * touch-layout artifact presence. Always returns a valid record (never null /
 * never throws): a missing/unreadable `.kps` yields the empty modality set at
 * the `default-fallback` tier so the absence is auditable.
 */
export function platformCoverageFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;

  const pkg = readKpsPackage(kb);
  const modalities = new Set<Modality>();

  if (pkg.fileExtensions.has(".kmx") || pkg.fileExtensions.has(".kmn")) modalities.add("desktop");
  if (pkg.fileExtensions.has(".js")) modalities.add("web");
  // `.keyman-touch-layout` from the <Files> list OR the collected source sibling.
  if (pkg.fileExtensions.has(".keyman-touch-layout") || findTouchLayoutSource(kb) !== null) {
    modalities.add("touch");
  }

  const value = [...modalities].sort();

  // Provenance: any readable package with file entries is declared metadata; a
  // missing/unreadable `.kps` (no signal at all) is the default-fallback tier.
  const hasSignal = pkg.present && pkg.fileExtensions.size > 0;
  const provenanceTier: Categorization["provenanceTier"] = hasSignal ? "declared-metadata" : "default-fallback";
  const confidenceClass: ConfidenceClass = hasSignal && value.length > 0 ? "confident" : "undetermined";

  const notes = hasSignal
    ? `modality inferred from bundled file types: [${[...pkg.fileExtensions].sort().join(" ")}]`
    : "no readable .kps <Files>; platform coverage undetermined";

  return {
    value,
    confidence: null,
    confidenceClass,
    provenanceTier,
    evidenceSize: value.length,
    analyzedCoverage: 1, // declared metadata is read in full; nothing opaque to miss
    analysisOutcome: hasSignal ? "fully" : "fallback-only",
    notes,
  };
}
