// Documentation stubs a Keyman package must ship.
//
// The package descriptor's `<Options>` names `welcome\welcome.htm` /
// `readme.htm` (spec 076 FR-002: the welcome page lives in the folder
// convention) and its `<Files>` lists them, so kmc-package fails the build
// (KM04003, "file does not exist") if either is absent.
//
// These two functions are now called from exactly one place:
// `helpDocsRender.ts`'s FR-002 placeholder fallback (spec 061) — the byte-
// identical text shipped when the author has no Phase F answers yet, on BOTH
// tracks. `output/ensurePackageFiles.ts` no longer writes either file itself;
// `projectWorkingCopyForOutput`'s step 5c writes both, unconditionally, on
// every production. `welcomeHtm`/`readmeHtm` stay exported here (rather than
// moving into helpDocsRender.ts) so the exact placeholder strings remain
// pinned by scaffolder.test.ts's own assertions below.
//
// The exact wording is pinned by scaffolder.test.ts ("HTML-escapes < > & in
// welcome.htm", "HTML-escapes & in readme.htm" — the latter asserts the
// "<name> keyboard" phrasing). Change it deliberately, not incidentally.

import { escapeHtml, phpCommentEscape, phpSingleQuoteEscape } from "./escapeHtml.js";

/**
 * The standard help-site header every published keyboard's `source/help/<id>.php`
 * opens with (spec 076 FR-003, contracts/help-header.md). Verified against the
 * corpus (`ahom_star`, `akha_lahu`): `$pagename` / `$pagetitle = $pagename` /
 * `require_once('header.php')`. The help site supplies `header.php`; the tool
 * emits the include reference only and never bundles or emulates it.
 *
 * Page name is `<Display Name> Keyboard Help` (criterion 11.7) — or
 * `<Display Name> Help` when the name already ends with the word "Keyboard",
 * so "Foo Keyboard" never becomes "Foo Keyboard Keyboard Help". Pure function
 * of the display name (SC-004 determinism).
 */
export function helpSiteHeader(displayName: string): string {
  const pageName = helpSitePageName(displayName);
  return `<?php\n  $pagename = '${phpSingleQuoteEscape(pageName)}';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n`;
}

/** The unescaped `$pagename` value for a display name (criterion 11.7 format). */
export function helpSitePageName(displayName: string): string {
  const name = displayName.replace(/\s+/g, " ").trim();
  return /\bkeyboard$/i.test(name) ? `${name} Help` : `${name} Keyboard Help`;
}

/**
 * `source/help/<id>.php` before the author has answered the Phase F description:
 * the standard header (US1-3 — an early production still renders on the help
 * site) above the bare placeholder comment the scaffolder has always shipped.
 * Shared by the scaffolder's stub and helpDocsRender's FR-002 fallback so both
 * emit byte-identical placeholder text from one copy of the rule (spec 061 D-04).
 */
export function helpPhpStub(displayName: string): string {
  return `${helpSiteHeader(displayName)}<?php /* ${phpCommentEscape(displayName)} help */ ?>`;
}

/** `source/welcome/welcome.htm` — shown by Keyman after the package installs. */
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
 * Called by `output/ensurePackageFiles` (the adapt/`.kmp` track). Track 1 goes
 * through the scaffolder's accumulated copyright block instead
 * (`attributionText` -> `renderLicense`), because a keyboard derived from a base
 * must RETAIN the base's holders and not merely state one (spec 064 US2).
 *
 * `holder` is nullable, and null omits the copyright line entirely. It used to
 * fall back to the keyboard's display name, which produced notices like
 * "Copyright © 2026 Dagbanli Keyboard" — naming the work as its own rights
 * holder. That is a false attribution, and worse than saying nothing, because a
 * wrong notice reads as authoritative (spec 064 FR-004).
 *
 * Not HTML-escaped: LICENSE.md is Markdown/plain text, not markup.
 */
export function licenseMd(holder: string | null, year: number): string {
  const notice = holder !== null ? `Copyright © ${year} ${holder}\n\n` : "";
  return `${notice}MIT License\n`;
}
