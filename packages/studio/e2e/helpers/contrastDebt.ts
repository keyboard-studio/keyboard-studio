// Known pre-existing WCAG 1.4.3 (Contrast Minimum) offenders shared by
// several walk specs, excluded per-node at axe call sites per FR-003's
// scoping rule (spec 056 — no blanket disables, every selector names its
// component). All of it is the SAME open debt: the 1.4.3 `unknown` row in
// specs/056-ada-accessibility/wcag-2.2-aa-tracker.md, tracked for a real fix
// by the issue filed from
// specs/057-bulletproof-navigation/reviews/056-contrast-issue-draft.md.
// None of these components are touched by spec 057.
//
// Selector groups are composed per screen family at the call site, so each
// scan still excludes only what its own screen actually renders. Spec-local
// KNOWN_CONTRAST_DEBT lists remain for offenders unique to one spec's walk
// (e.g. carve.spec.ts's carve-card spans).

/** 1.4.3 — the KeymanWeb OSK iframe renders KeymanWeb's own markup
 * (.kmw-spacebar-caption), not authored in this repo. */
export const OSK_IFRAME_DEBT: readonly string[] = ["iframe"];

/** 1.4.3 — chrome shared across several tabs. */
export const SHARED_CHROME_DEBT: readonly string[] = [
  // SignUpPanel's "Sign up with GitHub" button.
  'button[aria-label="Sign up with GitHub"]',
];

/** 1.4.3 — the Output screen: OskModeToggle's grouped Desktop-OSK/Mobile-KB
 * button pair, plus the shared chrome and the OSK iframe it embeds. */
export const OUTPUT_SCREEN_DEBT: readonly string[] = [
  'div[role="group"] > button',
  ...SHARED_CHROME_DEBT,
  ...OSK_IFRAME_DEBT,
];

/** 1.4.3 — the per-key glyph chips labelled "<char> — K_<key>" (GlyphCell /
 * inventory keycap rows): the small key-name span inside each chip fails
 * contrast against the chip background. */
export const GLYPH_KEY_CHIP_DEBT: readonly string[] = [
  'button[aria-label*="— K_"] > span',
];

/** 1.4.3 — LintChip's code badge (lint/LintChip.tsx renders the finding's
 * code in a <code> element coloured from lint/colors.ts's severity palette,
 * against the chip's #1c2128 background).
 *
 * This is survey-pane chrome, not one screen's furniture: LintSummary sits
 * above the question column for the whole walk, so any base whose .kmn carries
 * a lint finding surfaces it on EVERY survey screen the walk scans. Scoped to
 * the findings list rather than excluding every <code> on the page. */
export const LINT_CHIP_DEBT: readonly string[] = [
  '[aria-label="Lint findings"] code',
];
