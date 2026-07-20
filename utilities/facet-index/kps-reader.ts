/**
 * Shared `.kps` package reader for the base-selection `source.*` / `env.*` facet
 * classifiers (spec 043 T004).
 *
 * The corpus `.kps` dialect (verified against `bambara.kps`) has NO `<Targets>`
 * element — platform reach is derived from the bundled `<Files>` file types, not
 * a declaration (research Decision 4). This reader surfaces exactly the package
 * signals the five `source.*`/`env.*` facets read, all from in-repo file
 * contents only (FR-004, deterministic — no git history, no network):
 *
 *   - `platform-coverage`      -> `fileExtensions`
 *   - `font-dependency`        -> `fontFiles` + `oskFonts` (corroborated against the .kmn IR)
 *   - `license-fork-eligibility` (P3) -> `hasLicenseFile` + `licenseFilePath`
 *   - `declared-bcp47-tags`    (P3) -> `languageTags`
 *   - `package-completeness`   (P3) -> `hasOsk`/`hasWelcome`/`hasModel`/`hasIcon`
 *
 * A missing or malformed `.kps` yields the empty `KpsPackageInfo` (every set
 * empty, every flag false) rather than throwing — the caller falls through to
 * the facet's fallback tier (Edge Cases). It reuses the engine's `parseKps` /
 * `parseKpsFontRefs` so BCP47 + font extraction has one home (no forked regex).
 */

import { basename, extname } from "node:path";

import { parseKps, parseKpsFontRefs } from "../../packages/engine/src/base-browser/kps-parser.js";

import type { ScannedKeyboard } from "./scan.js";

/** Everything the base-selection package facets read from one keyboard's `.kps`. */
export interface KpsPackageInfo {
  /** Whether a `.kps` was found and read (false ⇒ every field below is empty/false). */
  present: boolean;
  /**
   * Lowercased file extensions of every `<Files><File><Name>` entry, e.g.
   * `.kmx`, `.js`, `.kvk`, `.ttf`. Derived from the file name, falling back to
   * the `<FileType>` child. The modality source for `platform-coverage`.
   */
  fileExtensions: Set<string>;
  /** Raw file names from the `<Files>` list (forward/back slashes intact). */
  fileNames: string[];
  /** Declared BCP47 language tags from `<Languages><Language ID="…">`. */
  languageTags: string[];
  /** Bundled font-file names (`.ttf`/`.otf`) among `<Files>` (from parseKpsFontRefs). */
  fontFiles: string[];
  /** `<OSKFont>`/`<DisplayFont>` references — the font wired into rendering. */
  oskFonts: string[];
  /** `<LicenseFile>` value, or a `LICENSE`/`COPYING` entry in `<Files>`; else null. */
  licenseFilePath: string | null;
  /** True when a license file is declared or bundled. */
  hasLicenseFile: boolean;
  /** On-screen-keyboard artifact present (a `.kvks`/`.kvk` among `<Files>`). */
  hasOsk: boolean;
  /** Help/welcome page present (`<WelcomeFile>` or a `welcome.htm` among `<Files>`). */
  hasWelcome: boolean;
  /** Predictive model present (a `.model.ts`/`.model.js`/`.model.kmp` among `<Files>`). */
  hasModel: boolean;
  /** Package icon present (a `.ico` among `<Files>`). */
  hasIcon: boolean;
}

/** The empty package info returned for a missing/malformed `.kps`. */
function emptyInfo(): KpsPackageInfo {
  return {
    present: false,
    fileExtensions: new Set<string>(),
    fileNames: [],
    languageTags: [],
    fontFiles: [],
    oskFonts: [],
    licenseFilePath: null,
    hasLicenseFile: false,
    hasOsk: false,
    hasWelcome: false,
    hasModel: false,
    hasIcon: false,
  };
}

/** The `.kps` XML text for this keyboard, or null when its source is absent. */
function readKpsXml(kb: ScannedKeyboard): string | null {
  const kpsSource = kb.sources.find((s) => s.path === kb.kpsPath);
  return kpsSource ? kpsSource.bytes.toString("utf8") : null;
}

/** Extract the file name of every `<File>` block, preferring `<Name>`. */
function extractFileNames(xml: string): string[] {
  const names: string[] = [];
  const fileBlockRe = /<File\s*>([\s\S]*?)<\/File>/gi;
  let block: RegExpExecArray | null;
  while ((block = fileBlockRe.exec(xml)) !== null) {
    const body = block[1] ?? "";
    const nameMatch = /<Name\s*>([^<]*)<\/Name>/i.exec(body);
    const name = (nameMatch?.[1] ?? "").trim();
    if (name.length > 0) names.push(name);
  }
  return names;
}

/**
 * The lowercased extension of a package file name. `.model.ts`/`.model.js` keep
 * their compound extension so predictive-model files are distinguishable from a
 * plain `.ts`/`.js` build output.
 */
function extensionOf(fileName: string): string {
  const base = basename(fileName.replace(/\\/g, "/")).toLowerCase();
  if (base.endsWith(".model.ts")) return ".model.ts";
  if (base.endsWith(".model.js")) return ".model.js";
  return extname(base);
}

/** Read a single element's text value, or null when absent/empty. */
function elementValue(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\s*>([^<]*)<\\/${tag}>`, "i").exec(xml);
  const v = (m?.[1] ?? "").trim();
  return v.length > 0 ? v : null;
}

/**
 * Read one keyboard's `.kps` package signals. Never throws: a missing or
 * unparseable `.kps` returns `emptyInfo()` (present: false).
 */
export function readKpsPackage(kb: ScannedKeyboard): KpsPackageInfo {
  const xml = readKpsXml(kb);
  if (xml === null || xml.trim().length === 0) return emptyInfo();

  const fileNames = extractFileNames(xml);
  const fileExtensions = new Set<string>();
  for (const name of fileNames) {
    const ext = extensionOf(name);
    if (ext.length > 0) fileExtensions.add(ext);
  }

  const languageTags = parseKps(xml).languages;
  const fontRefs = parseKpsFontRefs(xml);

  // License: an explicit <LicenseFile>, else a LICENSE/COPYING entry in <Files>.
  const declaredLicense = elementValue(xml, "LicenseFile");
  const bundledLicense =
    declaredLicense ??
    fileNames.find((n) => /(^|[\\/])(license|copying)(\.[^\\/]*)?$/i.test(basename(n.replace(/\\/g, "/")))) ??
    null;

  const welcomeDeclared = elementValue(xml, "WelcomeFile") !== null;

  const lowerNames = fileNames.map((n) => basename(n.replace(/\\/g, "/")).toLowerCase());
  const hasWelcome = welcomeDeclared || lowerNames.some((n) => n === "welcome.htm");

  return {
    present: true,
    fileExtensions,
    fileNames,
    languageTags,
    fontFiles: fontRefs.fileFonts,
    oskFonts: fontRefs.oskFonts,
    licenseFilePath: bundledLicense,
    hasLicenseFile: bundledLicense !== null,
    hasOsk: fileExtensions.has(".kvks") || fileExtensions.has(".kvk"),
    hasWelcome,
    hasModel: fileExtensions.has(".model.ts") || fileExtensions.has(".model.js") || fileExtensions.has(".model.kmp"),
    hasIcon: fileExtensions.has(".ico"),
  };
}
