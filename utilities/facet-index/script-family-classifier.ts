/**
 * Script-family classifier (spec 043 US3, T050) — character-content archetype.
 *
 * The writing-system family of the base's dominant script: one of {alphabet,
 * abugida, abjad, syllabary, logographic} (FR-032). Derived by mapping the
 * `script` classifier's dominant ISO-15924 code (reused via `deriveScriptContext`
 * — not re-derived) through the pinned `data/iso15924-script-family.json` lookup.
 *
 * This is the DURABLE guard for `combining-mark-repertoire` (FR-021): US2's
 * classifier carried an inline alphabetic-script list as a stand-in; US3 repoints
 * it at `deriveScriptFamily` here (task T061), so the family taxonomy lives in one
 * pinned table. A `keyboard.*` facet (no session mirror).
 *
 * A code absent from the table yields an undetermined family (null) — never a
 * guessed family (SC-004).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { deriveScriptContext, undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLE_PATH = resolve(HERE, "data", "iso15924-script-family.json");

let cachedTable: Record<string, string> | undefined;

function loadFamilyTable(): Record<string, string> {
  if (cachedTable !== undefined) return cachedTable;
  const raw = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as { family: Record<string, string> };
  cachedTable = raw.family;
  return cachedTable;
}

/**
 * The writing-system family of the base's dominant script, or null when the
 * dominant script is undetermined or absent from the pinned table. Exported so
 * `combining-mark-repertoire` consumes the same taxonomy (T061). Never throws.
 */
export function deriveScriptFamily(ir: KeyboardIR, def: FacetDefinition): string | null {
  const ctx = deriveScriptContext(ir, def);
  if (ctx.scriptFamily === null) return null;
  return loadFamilyTable()[ctx.scriptFamily] ?? null;
}

/**
 * Content-derived script family, or null when the dominant script is undetermined
 * / unmapped so the caller falls through to the undetermined fallback. Never throws.
 */
export function classifyScriptFamily(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  const ctx = deriveScriptContext(ir, def);
  if (ctx.scriptFamily === null) return null; // no dominant script — fall through.

  const family = loadFamilyTable()[ctx.scriptFamily];
  if (family === undefined) return null; // unmapped code — honest undetermined.

  return {
    value: family,
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    evidenceSize: 1,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: 1,
    notes: `dominant script ${ctx.scriptFamily} → ${family} family`,
  };
}

/**
 * Fallback: no dominant script (empty/opaque-only), an unmapped code, or a parse
 * failure. Script family is a content-derived measurement, so this is an honest
 * `undetermined`.
 */
export function scriptFamilyFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no dominant script or unmapped ISO-15924 code (or parse failure); script family undetermined");
}
