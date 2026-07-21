/**
 * Has-icon classifier — declared-metadata archetype.
 *
 * Value ∈ `{present, absent}`: whether the keyboard declares an icon bitmap at
 * all. `present` iff EITHER
 *
 *   - the `.kmn` header declares a `&BITMAP` system store with a value (the
 *     classic Keyman keyboard icon — `store(&BITMAP) 'foo.ico'` — shown next to
 *     the keyboard in the OS language switcher; the store value may be `.ico`
 *     OR `.bmp`, and this check is extension-agnostic), OR
 *   - the `.kps` bundles a `.ico` icon file among its `<Files>`.
 *
 * The `.kps` side is `.ico`-only ON PURPOSE. A `.bmp` in `<Files>` is, in the
 * corpus, the MSI-installer `<GraphicFile>` splash graphic, not a language-bar
 * icon — crediting it produced confirmed false positives (e.g. a keyboard that
 * ships a splash `.bmp` but declares no `&BITMAP` and bundles no `.ico`). Real
 * `.bmp` *icons* are always declared via the `&BITMAP` store, which the
 * extension-agnostic store check above already credits, so the `.kps` `.bmp`
 * branch added no true positives — only splash-graphic false positives.
 *
 * This is deliberately BROADER than `package-completeness`'s `icon` member,
 * which credits only a `.kps`-bundled `.ico`: this facet also credits the
 * `&BITMAP` header declaration, so a keyboard whose icon rides in the `.kmn`
 * header (not re-listed as a package file) still reads `present`.
 *
 * Unlike the other declared-metadata facets (`font-dependency`,
 * `package-completeness`, `declared-bcp47-tags`) whose deciding signal lives
 * entirely in the `.kps`, this facet's primary signal — the `&BITMAP` store —
 * lives in the parsed `.kmn` IR. So the real determination happens in
 * `classifyHasIcon` (which receives the IR), and the tier is `declared-metadata`
 * (the `&BITMAP` store and the package icon are both declarations, not
 * orthographic content). `hasIconFallback` handles the no-IR case (no `.kmn`, or
 * a codec parse failure): it can only inspect the `.kps` for a bundled icon.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { readKpsPackage } from "./kps-reader.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** True when the `.kmn` header declares a non-empty `&BITMAP` system store. */
function declaresBitmapStore(ir: KeyboardIR): boolean {
  return ir.stores.some((s) => s.isSystem && s.name === "BITMAP" && s.items.length > 0);
}

/**
 * True when the `.kps` bundles a `.ico` icon file among `<Files>`. `.ico` only:
 * a `<Files>` `.bmp` is the MSI `<GraphicFile>` splash graphic in the corpus, not
 * a language-bar icon (real `.bmp` icons are declared via the `&BITMAP` store,
 * which `declaresBitmapStore` credits extension-agnostically).
 */
function bundlesIconFile(fileExtensions: Set<string>): boolean {
  return fileExtensions.has(".ico");
}

/**
 * Content-derived path — but the deciding evidence is a declaration, so the
 * returned tier is `declared-metadata`, not `content-derived`. Reads the parsed
 * `.kmn` for a `&BITMAP` store and the `.kps` for a bundled icon; `present` iff
 * either is found. Always returns a record when an IR exists (never null) — the
 * `&BITMAP` store's absence is itself a definite `absent` signal we read from the
 * keyboard's own header.
 */
export function classifyHasIcon(ir: KeyboardIR, def: FacetDefinition, kb: ScannedKeyboard): Categorization | null {
  void def;

  const pkg = readKpsPackage(kb);
  const bitmapStore = declaresBitmapStore(ir);
  const bundledIcon = bundlesIconFile(pkg.fileExtensions);
  const present = bitmapStore || bundledIcon;

  const signals: string[] = [];
  if (bitmapStore) signals.push("&BITMAP header store");
  if (bundledIcon) signals.push("bundled .ico");

  return {
    value: present ? "present" : "absent",
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "declared-metadata",
    evidenceSize: 1, // one keyboard-level determination
    analyzedCoverage: 1,
    analysisOutcome: "fully",
    notes: present
      ? `declares an icon via ${signals.join(" + ")}`
      : pkg.present
        ? "no &BITMAP store and no bundled .ico; absent"
        : "no &BITMAP store in the .kmn; no readable .kps to check for a bundled icon; absent",
  };
}

/**
 * No-IR fallback (no `.kmn`, or a codec parse failure): the `&BITMAP` store is
 * unreadable, so only a `.kps`-bundled icon can be seen. `declared-metadata`
 * when a `.kps` was read, else `absent` at `default-fallback` (the conservative
 * default when nothing about the keyboard could be inspected).
 */
export function hasIconFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;

  const pkg = readKpsPackage(kb);
  const bundledIcon = bundlesIconFile(pkg.fileExtensions);

  return {
    value: bundledIcon ? "present" : "absent",
    confidence: null,
    confidenceClass: pkg.present ? "confident" : "undetermined",
    provenanceTier: pkg.present ? "declared-metadata" : "default-fallback",
    evidenceSize: 1,
    analyzedCoverage: 1,
    analysisOutcome: pkg.present ? "fully" : "fallback-only",
    notes: bundledIcon
      ? "no parsed .kmn to check for a &BITMAP store; .kps bundles a .ico icon"
      : pkg.present
        ? "no parsed .kmn to check for a &BITMAP store; .kps bundles no .ico; absent"
        : "no parsed .kmn and no readable .kps; icon presence undetermined, defaulted to absent",
  };
}
