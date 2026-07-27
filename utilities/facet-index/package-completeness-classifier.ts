/**
 * Package-completeness classifier (spec 043 US3, T052) — declared-metadata
 * archetype.
 *
 * A checklist of the optional package components the base ships, as a set over
 * {osk, help, predictive, icon} (FR-034): an on-screen-keyboard artifact (`.kvks`
 * /`.kvk`), a help/welcome page (`welcome.htm`/`<WelcomeFile>`), a predictive
 * model (`.model.*`), and a package icon (`.ico`). Read from the `.kps` via the
 * shared `kps-reader`. Feeds `source.package-completeness`.
 *
 * Like `font-dependency`/`license-fork-eligibility`, the deciding signal is
 * package metadata, not rule IR, so `classify` returns null and the build routes
 * every base through `packageCompletenessFallback`.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { readKpsPackage } from "./kps-reader.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** Content tier is intentionally empty — the deciding signal is package metadata. */
export function classifyPackageCompleteness(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void ir;
  void def;
  return null;
}

/**
 * Package-completeness checklist. Always returns a valid record (never null /
 * never throws): the set of present components at the `declared-metadata` tier
 * when a `.kps` was read, else the empty set at `default-fallback`.
 */
export function packageCompletenessFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;

  const pkg = readKpsPackage(kb);
  const components: string[] = [];
  if (pkg.hasOsk) components.push("osk");
  if (pkg.hasWelcome) components.push("help");
  if (pkg.hasModel) components.push("predictive");
  if (pkg.hasIcon) components.push("icon");
  components.sort();

  return {
    value: components,
    confidence: null,
    confidenceClass: pkg.present ? "confident" : "undetermined",
    provenanceTier: pkg.present ? "declared-metadata" : "default-fallback",
    evidenceSize: components.length,
    analyzedCoverage: 1,
    analysisOutcome: pkg.present ? "fully" : "fallback-only",
    notes: pkg.present
      ? `package ships: ${components.length > 0 ? components.join(", ") : "none of osk/help/predictive/icon"}`
      : "no readable .kps; package completeness undetermined",
  };
}
