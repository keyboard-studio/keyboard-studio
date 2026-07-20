/**
 * Font-dependency classifier (spec 043 US1, T013) — declared-metadata archetype.
 *
 * Value ∈ `{self-contained, system-font-reliant}` (FR-013, data-model):
 *
 *   system-font-reliant  iff the `.kps` bundles a `.ttf`/`.otf` AND the keyboard
 *                        wires that font into rendering (a `.kmn` visual-keyboard
 *                        / font store, or a `.kps` <OSKFont>/<DisplayFont> ref)
 *   self-contained       otherwise
 *
 * A base that bundles AND wires a specific font is signaling its script does not
 * render on default system fonts — it is reliant on that bundled font being
 * present to display correctly. This corroborates `orth.display-difficulty`
 * (a poorly-system-supported script bundles its own font). A base needing no
 * bundled font is `self-contained`. The mapping (condition → value) is the
 * data-model's; only the condition is measured here.
 *
 * No content-derived tier is claimed: the deciding signal (a bundled font file)
 * is package metadata, so `classifyFontDependency` returns null and the build
 * routes every base through `fontDependencyFallback`. The `.kmn` corroboration
 * is read from the raw `.kmn` text (a visual-keyboard/font store declaration),
 * which is available on the scanned keyboard without re-parsing.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { readKpsPackage } from "./kps-reader.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/**
 * Does the `.kmn` wire a visual-keyboard / font store? Matches the header stores
 * that bind an on-screen font or visual keyboard: `&VISUALKEYBOARD` (the `.kvks`
 * link) and `&LAYOUTFILE` (the touch/on-screen layout). Read from the raw text
 * so the fallback path needs no parsed IR (mirrors target-mix reading &TARGETS).
 */
function kmnWiresFontStore(kmnText: string | null): boolean {
  if (kmnText === null) return false;
  return /store\s*\(\s*&(VISUALKEYBOARD|LAYOUTFILE)\s*\)/i.test(kmnText);
}

/**
 * Content tier is intentionally empty — the deciding signal is a bundled package
 * file, not rule IR. Always returns null so the build routes to the fallback.
 */
export function classifyFontDependency(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void ir;
  void def;
  return null;
}

/**
 * Font-dependency categorization. Always returns a valid record (never null /
 * never throws): the worst case (no readable `.kps`) is `self-contained` at the
 * `default-fallback` tier — the conservative default when no bundled font is
 * known, recorded so the defaulting is auditable.
 */
export function fontDependencyFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;

  const pkg = readKpsPackage(kb);
  const bundlesFont = pkg.fontFiles.length > 0 || pkg.fileExtensions.has(".ttf") || pkg.fileExtensions.has(".otf");
  const fontWired = pkg.oskFonts.length > 0 || kmnWiresFontStore(kb.kmnText);

  const systemFontReliant = bundlesFont && fontWired;
  const value = systemFontReliant ? "system-font-reliant" : "self-contained";

  const provenanceTier: Categorization["provenanceTier"] = pkg.present ? "declared-metadata" : "default-fallback";

  const notes = systemFontReliant
    ? `bundles a font (${pkg.fontFiles.join(", ") || ".ttf/.otf in <Files>"}) wired via ${pkg.oskFonts.length > 0 ? "<OSKFont>/<DisplayFont>" : "a .kmn visual-keyboard store"}`
    : bundlesFont
      ? "bundles a font but does not wire it into rendering; treated as self-contained"
      : pkg.present
        ? "no bundled font; self-contained (renders with system fonts)"
        : "no readable .kps; defaulted to self-contained";

  return {
    value,
    confidence: null,
    confidenceClass: pkg.present ? "confident" : "undetermined",
    provenanceTier,
    evidenceSize: 1, // one keyboard-level determination
    analyzedCoverage: 1,
    analysisOutcome: pkg.present ? "fully" : "fallback-only",
    notes,
  };
}
