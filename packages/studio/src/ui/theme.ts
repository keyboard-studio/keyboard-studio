// Single token source for the ui/ primitive library.
//
// Two layers:
//
//   1. CSS custom-property accessors — canonical tokens backed by the
//      `--app-*` variables already defined in index.css and consumed by
//      BaseResolution. Primitives MUST use these so that a host-page
//      theme change propagates automatically.
//
//   2. Legacy hex constants — exact values from lib/galleryTheme.ts.
//      Kept here so galleryTheme.ts can become a thin re-export shim
//      (Decision 3) without changing any gallery import at that time.
//      Do NOT alter the hex literals — any change requires a coordinated
//      product decision (see the galleryTheme.ts header comment).
//
// Divergent values (Decision 2 / data-model.md "Divergent values" table):
// certain call-site colors differ from the canonical tokens; they are
// preserved exactly as distinct named tokens and flagged for post-P1
// normalization. No color is normalized in P1 (FR-005).

// ---------------------------------------------------------------------------
// 1. CSS custom-property accessors
//    These are `var(...)` strings — ready to drop into any `style` prop.
// ---------------------------------------------------------------------------

/** Page background: `var(--app-bg)` — resolves to #18243f in index.css */
export const CSS_BG = "var(--app-bg)" as const;

/** Surface (card) background: `var(--app-surface)` — resolves to #1f2c49 */
export const CSS_SURFACE = "var(--app-surface)" as const;

/** Secondary surface: `var(--app-surface-2)` — resolves to #27365a */
export const CSS_SURFACE_2 = "var(--app-surface-2)" as const;

/** Default border: `var(--app-border)` — resolves to #33436a */
export const CSS_BORDER = "var(--app-border)" as const;

/** Strong border: `var(--app-border-strong)` — resolves to #44588a */
export const CSS_BORDER_STRONG = "var(--app-border-strong)" as const;

/** Primary text: `var(--app-text)` — resolves to #eaf1fb */
export const CSS_TEXT = "var(--app-text)" as const;

/** Muted / dim text: `var(--app-text-muted)` — resolves to #aebcd6 */
export const CSS_TEXT_MUTED = "var(--app-text-muted)" as const;

/** Subtle text: `var(--app-text-subtle)` — resolves to #8493b6 */
export const CSS_TEXT_SUBTLE = "var(--app-text-subtle)" as const;

/** Accent color: `var(--app-accent)` — resolves to #5aa7f0 */
export const CSS_ACCENT = "var(--app-accent)" as const;

/** Accent hover: `var(--app-accent-hover)` — resolves to #74b6f4 */
export const CSS_ACCENT_HOVER = "var(--app-accent-hover)" as const;

/** Accent subtle background: `var(--app-accent-subtle)` — resolves to #243c61 */
export const CSS_ACCENT_SUBTLE = "var(--app-accent-subtle)" as const;

/** Accent text: `var(--app-accent-text)` — resolves to #8fc4f6 */
export const CSS_ACCENT_TEXT = "var(--app-accent-text)" as const;

/** UI font stack: `var(--app-font)` — 'Source Sans 3', system-ui, … */
export const CSS_FONT = "var(--app-font)" as const;

/** Monospace font stack: `var(--app-font-mono)` */
export const CSS_FONT_MONO = "var(--app-font-mono)" as const;

/** SIL green: `var(--sil-green)` — resolves to #509E2F */
export const CSS_SIL_GREEN = "var(--sil-green)" as const;

/** SIL orange: `var(--sil-orange)` — resolves to #d9a441 */
export const CSS_SIL_ORANGE = "var(--sil-orange)" as const;

/** SIL orange dark: `var(--sil-orange-dark)` — resolves to #ecc26a */
export const CSS_SIL_ORANGE_DARK = "var(--sil-orange-dark)" as const;

// ---------------------------------------------------------------------------
// 2. Legacy hex constants (galleryTheme compatibility)
//    Exact values from lib/galleryTheme.ts — must not be altered without a
//    coordinated product decision.
// ---------------------------------------------------------------------------

/** Dark page background used by mechanism / touch galleries. */
export const BG_PAGE = "#0d1117";

/** Dark card surface used by mechanism / touch galleries. */
export const BG_CARD = "#161b22";

/** Default border color used by mechanism / touch galleries. */
export const BORDER = "#30363d";

/** Accent / link color used by mechanism / touch galleries. */
export const ACCENT = "#6ea8fe";

/** Dim / muted text used by mechanism / touch galleries. */
export const TEXT_DIM = "#8b949e";

/** Main text color used by mechanism / touch galleries. */
export const TEXT_MAIN = "#e6edf3";

/** UI font stack string used by mechanism / touch galleries. */
export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Primary action blue used by mechanism / touch galleries. */
export const BLUE_ACTION = "#1f6feb";

// ---------------------------------------------------------------------------
// 3. Divergent / preserved tokens
//    Each value differs from every canonical token and is preserved exactly
//    (FR-005 zero-diff). Flagged for post-P1 normalization review.
// ---------------------------------------------------------------------------

/**
 * Error-state border — used in ScaffoldForm and TrackOneIdentityPanel for
 * invalid-id input borders. Near canonical border `#30363d` (BORDER) but
 * intentionally distinct; preserved as-is (post-P1 normalization candidate).
 */
export const ERROR_BORDER = "#7a2a2a";

/**
 * Error-state text — used in ScaffoldForm and TrackOneIdentityPanel for
 * inline validation messages. No canonical counterpart; preserved exactly.
 */
export const ERROR_TEXT = "#f0a0a0";

/**
 * Warning text — used in TrackOneIdentityPanel for the "still base id"
 * advisory. No canonical counterpart; preserved exactly.
 */
export const WARNING = "#d29922";

/**
 * Success accent / SIL green hex — used in TrackOneIdentityPanel section
 * heading. Also available as the CSS var `var(--sil-green)` which resolves
 * to #509E2F in index.css; the hex here matches `--sil-green` in
 * TrackOneIdentityPanel (`#7ee787`). Both values are preserved; normalization
 * is a post-P1 decision.
 */
export const SUCCESS_ACCENT = "#7ee787";
