// Documentation stubs a Keyman package must ship.
//
// The package descriptor's `<Options>` names `welcome\welcome.htm` /
// `readme.htm` (spec 080 FR-002: the welcome page lives in the folder
// convention) and its `<Files>` lists them, so kmc-package fails the build
// (KM04003, "file does not exist") if either is absent.
//
// These two functions are the scaffolder's initial stubs for the two files
// the descriptor names. `output/ensurePackageFiles.ts` no longer writes
// either file itself; `projectWorkingCopyForOutput`'s step 5c re-renders
// both, unconditionally, on every production — `welcomeHtm` renders through
// the same `welcome` form as that re-render, so stub and shipped page share
// one shape. `welcomeHtm`/`readmeHtm` stay exported here (rather than moving
// into helpDocsRender.ts) so the exact placeholder strings remain pinned by
// scaffolder.test.ts's own assertions below.
//
// The exact wording is pinned by scaffolder.test.ts ("HTML-escapes < > & in
// welcome.htm", "HTML-escapes & in readme.htm" — the latter asserts the
// "<name> keyboard" phrasing). Change it deliberately, not incidentally.

import { DOC_FORMS } from "@keyboard-studio/contracts";
import { escapeHtml, phpCommentEscape, phpSingleQuoteEscape } from "./escapeHtml.js";
import { getLanguageDefaults } from "../langtags/index.js";
import { renderDocForm } from "./renderDocForm.js";

/**
 * The standard help-site header every published keyboard's `source/help/<id>.php`
 * opens with (spec 080 FR-003, contracts/help-header.md). Verified against the
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

/**
 * The one inline style every fresh welcome/help page carries (element spec
 * §1: a small inline style, shared with the help page so style parity,
 * criterion 11.10, holds by construction). Corpus convention is a small
 * inline style — linked CSS is rare — and the rules stay minimal: readable
 * text, layout charts that fit the page, a legible typing-guide table.
 */
export const DOC_PAGE_STYLE =
  "body { font-family: sans-serif; line-height: 1.4; margin: 1em; }\n" +
  "img { max-width: 100%; }\n" +
  "table { border-collapse: collapse; }\n" +
  "th, td { border: 1px solid #999; padding: 0.2em 0.5em; text-align: left; }\n" +
  "kbd { background: #eee; border: 1px solid #ccc; border-radius: 3px; padding: 0 0.3em; }";

/**
 * `source/welcome/welcome.htm` — shown by Keyman after the package installs.
 * Rendered through the same `welcome` form the output projection renders, so
 * the scaffolder stub and the shipped page are one shape: the element-spec
 * §1 shell (doctype, head with charset + "Start Using" title + the shared
 * inline style) around the fallback body. The projection re-renders on every
 * production, adding the answer-derived body and the page language.
 */
export function welcomeHtm(displayName: string): string {
  const name = escapeHtml(displayName);
  return renderDocForm(DOC_FORMS.forms.welcome, {
    displayName: name,
    pageStyle: DOC_PAGE_STYLE,
    body: `<h1>${name}</h1>\n<p>Welcome to ${name}</p>`,
  });
}

/** `source/readme.htm` — shown by Keyman in the package details. */
export function readmeHtm(displayName: string): string {
  return `<html><body><p>${escapeHtml(displayName)} keyboard</p></body></html>`;
}

/**
 * Escape Markdown-special characters in an author-supplied value so a name
 * containing e.g. `[`, `]`, or `#` can't break the README's rendering.
 *
 * Underscores are left alone: they are legal in keyboard ids and form no
 * emphasis intra-word in CommonMark, so escaping them would only corrupt
 * pinned ids such as `base_keyboard`.
 *
 * @internal
 */
function escapeMarkdown(s: string): string {
  return s.replace(/([\\`*{}[\]()<>#+.!-])/g, "\\$1");
}

/**
 * `README.md` — comprehensive keyboard documentation for users and contributors.
 *
 * Generates a professional, informative README that includes:
 * - Keyboard purpose and features
 * - Languages supported
 * - How to type special characters (generic guide)
 * - Installation instructions for all platforms
 * - Links to help resources
 * - Contributing guidelines
 *
 * This is suitable for Keyman repository submissions and provides sufficient
 * documentation for end users. For keyboards with complex diacritics or
 * deadkeys, authors can manually enhance this template with specifics about
 * their keyboard's unique typing methods.
 *
 * Not HTML-escaped: README.md is Markdown/plain text, not markup.
 */
export function readmeMd(
  displayName: string,
  keyboardId: string,
  languages: string[] = [],
  baseKeyboardName?: string,
): string {
  // Escape Markdown-special characters in author-supplied values so a name
  // containing e.g. `[`, `]`, or `#` can't break the rendered README.
  const name = escapeMarkdown(displayName);
  const id = escapeMarkdown(keyboardId);
  const base = baseKeyboardName ? escapeMarkdown(baseKeyboardName) : undefined;

  const languageList =
    languages.length > 0
      ? languages.map((tag) => `- **${languageNameForTag(tag)}** (code: \`${tag}\`)`).join("\n")
      : "- Language support information to be confirmed";

  const baseKeyboardSection = base
    ? `- Based on ${base}`
    : "- Adapted from a standard keyboard layout";

  const dateStr = new Date().toISOString().split("T")[0];

  return `# ${name}

Type text with the ${name} keyboard, with comprehensive character and diacritic support.

## Languages Supported

${languageList}

## Features

- Comprehensive character and diacritic support
${baseKeyboardSection}
- Touch-friendly layouts for mobile and tablet
- Desktop and web support
- Keyman-compatible on all platforms

## How to Type Special Characters

Use the following methods to access extended characters and diacritics:

### Method 1: On-Screen Keyboard Layout

When you start typing, Keyman displays a visual keyboard showing:
- Regular characters on the base layer
- Shift combinations for capitals and punctuation
- Modifier combinations (AltGr/Option/Right Alt) for accents and special characters
- Tap or click any key to insert that character

### Method 2: Touch Layout (Mobile & Tablet)

On mobile and tablet devices:
- Tap and hold a base character key to see available accented variants
- Select the accented version from the popup menu
- Smart suggestions help you type faster

### Method 3: Key Sequences

Some keyboards use sequences to type accented characters:
- Press the diacritic key (such as an accent key)
- Follow with the base letter to combine them
- Consult the visual keyboard for available combinations

## Platform Support

- **Windows, macOS, Linux** — via Keyman Desktop
- **iOS, Android** — via Keyman Mobile
- **Web** — via Keyman Online at keyman.com/keyboard

## Installation

### Step 1: Get Keyman

1. Visit [keyman.com](https://keyman.com)
2. Download Keyman Engine for your device:
   - **Windows/Mac/Linux:** Keyman Desktop
   - **iOS:** Keyman for iPhone/iPad
   - **Android:** Keyman for Android
3. Install and follow the setup instructions

### Step 2: Install This Keyboard

1. Open Keyman
2. Go to the keyboard store or catalog
3. Search for "${name}"
4. Click "Install" and follow prompts
5. Select "${name}" from your active keyboard list

### Getting Help

- **Online Help:** [help.keyman.com/keyboard/${id}](https://help.keyman.com/keyboard/${id})
- **Keyman Community:** [keyman.com/community](https://keyman.com/community)
- **Developer Resources:** [Keyman Developer](https://help.keyman.com/developer)

## Keyboard Layout

This keyboard is based on ${base ?? "a standard keyboard layout"} and provides comprehensive support for:
- Base Latin characters (A-Z, a-z)
- Diacritical marks (accents, tone marks, and other modifiers)
- Special punctuation and symbols
- Language-specific characters and variants

Refer to the visual keyboard layout displayed in Keyman for exact key positions and available character combinations.

## Contributing

Found an issue? Have a suggestion or want to help improve this keyboard?

1. **Report an Issue:** [keyboard-studio Issues](https://github.com/keyboard-studio/keyboard-studio/issues)
2. **Submit Changes:** [keyboard-studio Pull Requests](https://github.com/keyboard-studio/keyboard-studio/pulls)
3. **Community Keyboards:** [keymanapp/keyboards Repository](https://github.com/keymanapp/keyboards)

## License

See [LICENSE.md](LICENSE.md) for copyright and license information.

## Credits

Created with [keyboard-studio](https://github.com/keyboard-studio/keyboard-studio) —
an open-source authoring system by [SIL International](https://www.sil.org/)
for creating Keyman keyboards with guided workflows.

---

**Version:** 1.0 | **Updated:** ${dateStr}
`;
}

/**
 * Human-readable name for a language tag, from the canonical langtags
 * dataset (the same source the studio's language picker uses), so the
 * README names languages exactly as the rest of the studio does.
 * Unknown codes fall back to the capitalized code itself.
 *
 * @internal
 */
function languageNameForTag(tag: string): string {
  return getLanguageDefaults(tag)?.englishName ?? capitalizeTag(tag);
}

/**
 * Capitalize the first letter of a language tag.
 *
 * @internal
 */
function capitalizeTag(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
 *
 * Rendered through the `license` form (spec 102 FR-026: the copyright year
 * appears only here). A null holder leaves the `copyrightHolder` slot empty,
 * so the form drops the notice block. Callers pass null for a blank holder
 * (ensurePackageFiles trims first); a whitespace-only holder would also drop
 * the notice, where the old template emitted an empty-named one.
 */
export function licenseMd(holder: string | null, year: number): string {
  return renderDocForm(DOC_FORMS.forms.license, {
    copyrightHolder: holder ?? "",
    year: String(year),
  });
}
