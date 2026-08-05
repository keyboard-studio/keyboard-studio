// Documentation stubs a Keyman package must ship.
//
// The package descriptor's `<Options>` names `welcome.htm` / `readme.htm` and
// its `<Files>` lists them, so kmc-package fails the build (KM04003, "file does
// not exist") if either is absent. Track 1 gets them from the scaffolder's
// generateStubs; Track 2 (adapt-existing) starts from a fetched .kmn and has
// neither, so `output/ensurePackageFiles.ts` writes them at output time.
//
// One home for both callers: two copies of a template that must satisfy the
// same descriptor is how the tracks drifted apart in the first place.
//
// The exact wording is pinned by scaffolder.test.ts ("HTML-escapes < > & in
// welcome.htm", "HTML-escapes & in readme.htm" — the latter asserts the
// "<name> keyboard" phrasing). Change it deliberately, not incidentally.

import { escapeHtml } from "./escapeHtml.js";

/** `source/welcome.htm` — shown by Keyman after the package installs. */
export function welcomeHtm(displayName: string): string {
  return `<html><body><p>Welcome to ${escapeHtml(displayName)}</p></body></html>`;
}

/** `source/readme.htm` — shown by Keyman in the package details. */
export function readmeHtm(displayName: string): string {
  return `<html><body><p>${escapeHtml(displayName)} keyboard</p></body></html>`;
}

/**
 * `LICENSE.md` — the MIT stub every package must ship so it is redistributable.
 *
 * One home for both callers: the scaffolder's `generateStubs` (Track 1, holder
 * = displayName) and `output/ensurePackageFiles` (Track 2, holder = the
 * author's copyright falling back to displayName). Two copies of this literal
 * is exactly the kind of drift `welcomeHtm`/`readmeHtm` were consolidated to
 * prevent. Not HTML-escaped: LICENSE.md is Markdown/plain text, not markup.
 */
export function licenseMd(holder: string, year: number): string {
  return `Copyright © ${year} ${holder}\n\nMIT License\n`;
}
