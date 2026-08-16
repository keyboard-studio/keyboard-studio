// Known pre-existing WCAG 1.4.3 (Contrast Minimum) offenders shared by
// several walk specs, excluded per-node at axe call sites per FR-003's
// scoping rule (spec 056 — no blanket disables, every selector names its
// component).
//
// #1477 ground-truth sweep: every entry this file used to carry — OskModeToggle,
// SignUpPanel's GitHub button, the per-key glyph chips (GLYPH_KEY_CHIP_DEBT),
// and LintChip's code badge (LINT_CHIP_DEBT) — was re-scanned live with its
// exclusion emptied. OskModeToggle/SignUpPanel/glyph-chips came back clean (no
// serious/critical violation survives on current `main`; the debt was already
// fixed by an earlier contrast pass and these entries were stale). LintChip's
// code badge was a REAL, reproducible failure (navy theme's
// --app-danger-text at 4.22:1 against --app-surface-2, below the 4.5:1
// minimum) and is fixed at the source (lint/colors.ts's SEVERITY_COLORS
// consumers now use the new --app-danger-text-on-surface-2 token for
// fatal/error text on that specific surface) rather than carried here as
// permanent debt.
//
// The OSK iframe's `.kmw-spacebar-caption` (the last entry this file
// carried) is fixed too — see OSK_IFRAME_DEBT's own doc comment below and
// wcag-2.2-aa-tracker.md's 1.4.3 row. No debt remains in this file.

/**
 * FORMERLY 1.4.3 debt: the KeymanWeb OSK iframe's `.kmw-spacebar-caption`.
 * Now fixed at the source — the frame (packages/studio/public/osk-frame.html)
 * carries a scoped `#osk-host .kmw-spacebar-caption { color: #000
 * !important; }` override with enough specificity to beat every selector
 * in KMW's own kmwosk.css regardless of load order or `prefers-color-scheme`
 * (see the comment beside that rule for the contrast math). Kept as an
 * empty array — not deleted — so any call site still spreading it
 * (`...OSK_IFRAME_DEBT`) keeps compiling instead of needing a rename in the
 * same change; new code should not add anything here. If a *different* OSK
 * iframe surface regresses, it needs its own named entry with fresh
 * evidence, not a re-population of this one.
 */
export const OSK_IFRAME_DEBT: readonly string[] = [];

/** 1.4.3 — the Output screen's only remaining known offender is the OSK
 * iframe it embeds (OskModeToggle and SignUpPanel were re-verified clean by
 * the #1477 sweep — see header comment). Kept as its own named export,
 * rather than inlining OSK_IFRAME_DEBT at each call site, so a future
 * Output-screen-specific offender has a single place to land without
 * touching every call site again. */
export const OUTPUT_SCREEN_DEBT: readonly string[] = [...OSK_IFRAME_DEBT];
