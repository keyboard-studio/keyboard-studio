/**
 * License-fork-eligibility classifier (spec 043 US3, T048) — declared-metadata
 * archetype.
 *
 * Whether the base's license permits forking-and-adapting: {permissive, copyleft,
 * proprietary-restricted, unspecified} (FR-030). Derived by matching the base's
 * LICENSE file text (collected into `kb.sources` by scan.ts via the `.kps`
 * `<LicenseFile>`) against the pinned `data/known-licenses.json` header-signature
 * table. No match — or no readable license — yields the honest `unspecified`
 * sentinel: license identity is NEVER inferred from author/copyright/vendor
 * (research Decision 7, SC-004).
 *
 * Like `font-dependency`, the deciding signal is package metadata (a file), not
 * rule IR, so `classify` returns null and the build routes every base through
 * `licenseForkEligibilityFallback`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { readKpsPackage } from "./kps-reader.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLE_PATH = resolve(HERE, "data", "known-licenses.json");

interface LicenseEntry {
  id: string;
  category: string;
  match: string[];
}

let cachedTable: LicenseEntry[] | undefined;

function loadLicenseTable(): LicenseEntry[] {
  if (cachedTable !== undefined) return cachedTable;
  const raw = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as { licenses: LicenseEntry[] };
  cachedTable = raw.licenses;
  return cachedTable;
}

/** The known-license entry whose signature appears in the text, in table order, or null. */
function matchLicense(text: string): LicenseEntry | null {
  const upper = text.toUpperCase();
  for (const entry of loadLicenseTable()) {
    if (entry.match.some((sig) => upper.includes(sig.toUpperCase()))) return entry;
  }
  return null;
}

/** Content tier is intentionally empty — the deciding signal is a package file. */
export function classifyLicenseForkEligibility(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void ir;
  void def;
  return null;
}

/**
 * License categorization. Always returns a valid record (never null / never
 * throws): a base whose LICENSE text matches a known signature reads its category
 * at the `declared-metadata` tier; an unreadable/unrecognized license reads
 * `unspecified` — at `declared-metadata` when a `.kps` was present (the absence of
 * a recognizable license is a real reading), else `default-fallback`.
 */
export function licenseForkEligibilityFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;

  const pkg = readKpsPackage(kb);
  const matched = pkg.licenseText ? matchLicense(pkg.licenseText) : null;

  const value = matched ? matched.category : "unspecified";
  const provenanceTier: Categorization["provenanceTier"] = pkg.present ? "declared-metadata" : "default-fallback";

  const notes = matched
    ? `LICENSE matches ${matched.id} → ${matched.category}`
    : pkg.licenseText
      ? "LICENSE present but matches no known signature; unspecified (never inferred)"
      : pkg.hasLicenseFile
        ? "a license file is declared but its text was not collected; unspecified"
        : pkg.present
          ? "no license file; unspecified (never inferred from author/copyright)"
          : "no readable .kps; unspecified";

  return {
    value,
    confidence: null,
    confidenceClass: matched ? "confident" : "undetermined",
    provenanceTier,
    evidenceSize: matched ? 1 : 0,
    analyzedCoverage: 1,
    analysisOutcome: pkg.present ? "fully" : "fallback-only",
    notes,
  };
}
