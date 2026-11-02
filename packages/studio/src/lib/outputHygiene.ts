// Output-projection hygiene: two criteria the generator settles by rewriting
// text it carries through from the starting point, on the output projection
// only (never the working copy).
//
//   1.10b  the .kpj project file carries the current format version
//   4.6b   no copyright year in the .kmn / .kps copyright strings (years live
//          in LICENSE.md and HISTORY.md)

import type { VirtualFS } from "@keyboard-studio/contracts";

import { readVfsText } from "./vfsText.ts";

/**
 * The project-file format keyboards in the corpus carry (criterion 1.10). The
 * keyboard-lint check holds the same pin; this is the generator-side copy.
 */
export const KPJ_CURRENT_FORMAT_VERSION = "2.0";

const OPTIONS_BLOCK = /<Options>([\s\S]*?)<\/Options>/i;
const VERSION_ELEMENT = /<Version>\s*([^<]*?)\s*<\/Version>/i;

/**
 * Give a `.kpj` that has no `<Options><Version>` the current format version.
 * A project that already declares a version is left exactly as it is. Returns
 * the input unchanged when it has no `<Options>` block to stamp into.
 */
export function stampKpjFormatVersion(kpjText: string): string {
  const options = OPTIONS_BLOCK.exec(kpjText);
  if (options === null) return kpjText;
  const declared = VERSION_ELEMENT.exec(options[1] ?? "")?.[1] ?? "";
  if (declared !== "") return kpjText;
  const newline = kpjText.includes("\r\n") ? "\r\n" : "\n";
  // A present-but-empty <Version></Version> is replaced, not duplicated.
  const inner = (options[1] ?? "").replace(VERSION_ELEMENT, "");
  const stamped = `<Options>${newline}    <Version>${KPJ_CURRENT_FORMAT_VERSION}</Version>${inner}</Options>`;
  return `${kpjText.slice(0, options.index)}${stamped}${kpjText.slice(options.index + options[0].length)}`;
}

/** A year, or a run of years (`2017-2025`, `2017, 2019`), with the whitespace before it. */
const YEAR_RUN = /\s*\b\d{4}(?:\s*[-\u2013,]\s*\d{4})*\b/g;

/** `s` without its years; collapses the double space a mid-string year leaves. */
function withoutYears(s: string): string {
  return s.replace(YEAR_RUN, "").replace(/ {2,}/g, " ").replace(/\s+$/, "");
}

/**
 * Strip the year from `store(&COPYRIGHT) '...'` in a `.kmn` and from the
 * `<Copyright>` element of a `.kps` (criterion 4.6). Only those two strings
 * are touched; a year in a comment or anywhere else is the author's.
 *
 * `carriedValue` is the starting keyboard's `&COPYRIGHT` value (unquoted, as
 * parsed). A line that carries the starting point's own notice is left
 * byte-identical — offered/carried, never silently replaced (#2281) — so the
 * 4.6 year strip applies only to lines this session authored.
 */
export function stripCopyrightYearsFromKmn(kmnText: string, carriedValue?: string): string {
  return kmnText.replace(
    /(store\(\s*&COPYRIGHT\s*\)\s*)(['"])([^\r\n]*?)\2/i,
    (m, head: string, quote: string, value: string) =>
      carriedValue !== undefined && value === carriedValue
        ? m
        : `${head}${quote}${withoutYears(value)}${quote}`,
  );
}

export function stripCopyrightYearsFromKps(kpsText: string): string {
  return kpsText.replace(
    /(<Copyright[^>]*>)([^<]*)(<\/Copyright>)/i,
    (_m, open: string, value: string, close: string) => `${open}${withoutYears(value)}${close}`,
  );
}

/**
 * Options for {@link applyOutputHygiene}.
 */
export interface OutputHygieneOptions {
  /**
   * The starting keyboard's `store(&COPYRIGHT)` value (unquoted, as parsed
   * into the start IR's header). When the projected `.kmn` carries that line
   * through, the 4.6b year strip leaves it byte-identical: the starting
   * point's notice is carried, never silently replaced (#2281).
   */
  carriedCopyright?: string | undefined;
}

/**
 * Apply both hygiene rewrites to a projected tree, in place. `keyboardId` is
 * the output id (the projection has already renamed `source/<id>.*` and the
 * root `<id>.kpj`).
 */
export function applyOutputHygiene(vfs: VirtualFS, keyboardId: string, opts?: OutputHygieneOptions): void {
  const kpjPath = `${keyboardId}.kpj`;
  const kpj = readVfsText(vfs, kpjPath);
  if (kpj !== undefined) {
    const next = stampKpjFormatVersion(kpj);
    if (next !== kpj) vfs.set(kpjPath, next, false);
  }
  const kmnPath = `source/${keyboardId}.kmn`;
  const kmn = readVfsText(vfs, kmnPath);
  if (kmn !== undefined) {
    const next = stripCopyrightYearsFromKmn(kmn, opts?.carriedCopyright);
    if (next !== kmn) vfs.set(kmnPath, next, false);
  }
  const kpsPath = `source/${keyboardId}.kps`;
  const kps = readVfsText(vfs, kpsPath);
  if (kps !== undefined) {
    const next = stripCopyrightYearsFromKps(kps);
    if (next !== kps) vfs.set(kpsPath, next, false);
  }
}
