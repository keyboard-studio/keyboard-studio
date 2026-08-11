// Single token source for the ui/ primitive library.
//
// Two layers:
//
//   1. CSS custom-property accessors — canonical tokens backed by the
//      `--app-*` variables already defined in index.css and consumed by
//      BaseResolution. Primitives MUST use these so that a host-page
//      theme change propagates automatically.
//
//   2. Legacy-named constants (galleryTheme.ts compatibility) — these used
//      to be raw hex literals from the pre-design-system dark palette.
//      Epic #533 (design-system adoption) is the coordinated product
//      decision the original header on this file asked for: every constant
//      below is now a `var(--app-*)` string, not a literal color, so a host
//      theme change (light/navy) propagates to the ~86 files that import
//      these names without editing a single call site. The CONST NAMES are
//      unchanged on purpose — only what they resolve to changed.
//
// Divergent values (Decision 2 / data-model.md "Divergent values" table):
// certain call-site colors used to differ from the canonical tokens; §3
// below maps each of those onto the semantic token that matches its actual
// visual role (border vs. text vs. background), the "divergent / preserved"
// normalization epic #533 sanctions.
//
// New code should prefer the `var(--app-*)` token directly (e.g.
// `"var(--app-border)"`) over importing one of these named constants —
// these exist for the pre-token-layer call sites that already import them.

// ---------------------------------------------------------------------------
// 1. CSS custom-property accessors
//    These are `var(...)` strings — ready to drop into any `style` prop.
// ---------------------------------------------------------------------------

/** Page background: `var(--app-bg)` */
export const CSS_BG = "var(--app-bg)" as const;

/** Surface (card) background: `var(--app-surface)` */
export const CSS_SURFACE = "var(--app-surface)" as const;

/** Default border: `var(--app-border)` */
export const CSS_BORDER = "var(--app-border)" as const;

/** Secondary / nested surface (e.g. a keycap's own background against a card): `var(--app-surface-2)` */
export const CSS_SURFACE_2 = "var(--app-surface-2)" as const;

/** Emphasized border (e.g. a keycap's own outline against a card border): `var(--app-border-strong)` */
export const CSS_BORDER_STRONG = "var(--app-border-strong)" as const;

/** Primary text: `var(--app-text)` */
export const CSS_TEXT = "var(--app-text)" as const;

/** Muted / dim text: `var(--app-text-muted)` */
export const CSS_TEXT_MUTED = "var(--app-text-muted)" as const;

/** Subtle text: `var(--app-text-subtle)` */
export const CSS_TEXT_SUBTLE = "var(--app-text-subtle)" as const;

/** Accent color: `var(--app-accent)` */
export const CSS_ACCENT = "var(--app-accent)" as const;

/** UI font stack: `var(--app-font)` — 'Source Sans 3', system-ui, … */
export const CSS_FONT = "var(--app-font)" as const;

/** Monospace font stack: `var(--app-font-mono)` */
export const CSS_FONT_MONO = "var(--app-font-mono)" as const;

/** SIL green: `var(--sil-green)` */
/**
 * Text/icon colour for content sitting ON an accent-filled surface (primary
 * buttons, active badges). NOT interchangeable with `CSS_TEXT` — the accent is
 * dark on light and light on navy, so on-accent text has to invert with it.
 * `--app-text` on the accent fill measures 2.43:1 (light) / 2.25:1 (navy);
 * this token measures 6.50:1 / 6.03:1. See styles/colors.css.
 */
export const CSS_TEXT_ON_ACCENT = "var(--app-text-on-accent)" as const;

export const CSS_SIL_GREEN = "var(--sil-green)" as const;

/** SIL orange dark: `var(--sil-orange-dark)` */
export const CSS_SIL_ORANGE_DARK = "var(--sil-orange-dark)" as const;

// ---------------------------------------------------------------------------
// 2. Legacy-named constants (galleryTheme compatibility)
//    Token references — see the file header. Names are unchanged from the
//    pre-#533 hex-literal versions so galleryTheme.ts stays a thin re-export
//    shim and none of the ~86 importers need editing.
// ---------------------------------------------------------------------------

/** Page background used by mechanism / touch galleries. */
export const BG_PAGE = "var(--app-bg)";

/** Card surface used by mechanism / touch galleries. */
export const BG_CARD = "var(--app-surface)";

/** Default border color used by mechanism / touch galleries. */
export const BORDER = "var(--app-border)";

/** Accent / link color used by mechanism / touch galleries. */
export const ACCENT = "var(--app-accent)";

/** Dim / muted text used by mechanism / touch galleries. */
export const TEXT_DIM = "var(--app-text-muted)";

/** Main text color used by mechanism / touch galleries. */
export const TEXT_MAIN = "var(--app-text)";

/** UI font stack string used by mechanism / touch galleries. */
export const FONT = "var(--app-font)";

/** Primary action blue used by mechanism / touch galleries. */
export const BLUE_ACTION = "var(--app-accent)";

/** Monospace font stack used by editors, diagnostics, and code displays. */
export const FONT_MONO = "var(--app-font-mono)";

// ---------------------------------------------------------------------------
// 3. Divergent / preserved tokens
//    Each name below used to hold a literal color that differed from every
//    canonical token. Epic #533 is the sanctioned normalization: each now
//    points at the semantic token matching its call sites' actual visual
//    role (see the per-constant comment for the reasoning, and the crew
//    report for constants whose call sites split across more than one role).
// ---------------------------------------------------------------------------

/**
 * Error-state border — used in ScaffoldForm and TrackOneIdentityPanel for
 * invalid-id input borders, and in TextField/Textarea/Notice's `error`
 * variant. All call sites use this as a `border-color`, never a background
 * or text color — a clean 1:1 match for the danger-border semantic token.
 */
export const ERROR_BORDER = "var(--app-danger-border)";

/**
 * Error-state text — used in ScaffoldForm, TrackOneIdentityPanel, Notice,
 * Field, ErrorText, AccountControl, and ProfileScreen for inline validation
 * / error messages. All call sites use this as a text `color`.
 */
export const ERROR_TEXT = "var(--app-danger-text)";

/**
 * Warning text — used in TrackOneIdentityPanel, Notice, ErrorText, and the
 * assign-loop key-diagnostic gutters for warning-tone text. All call sites
 * use this as a text `color`.
 */
export const WARNING = "var(--app-warning-text)";

/**
 * Success accent — used in MyKeyboardsList, MetadataCard, and
 * DiagnosticsPanel for success-state text/fill. All call sites use this as
 * a text `color`.
 */
export const SUCCESS_ACCENT = "var(--app-success-text)";

/**
 * Survey chip glyph accent — the confirmed/checked character-glyph color in
 * the Phase B chip pickers. Used as both a text `color` and a chip `border`;
 * both are accent-strength decorative uses (not body text needing a -text
 * contrast variant), so this maps to the general accent-on-surface token.
 */
export const CHIP_GLYPH_ACCENT = "var(--app-accent-text)";

/**
 * Error / danger red — the survey character-chip remove-x glyph, and the
 * assign-loop galleries' 0-count badge / suggestion-row border+text
 * treatments. Used as text `color` and `border-color` (decorative accent
 * strength, not paragraph body text), so this maps to the danger base token
 * rather than the -text variant.
 */
export const ERROR_RED = "var(--app-danger)";

/**
 * Error-state dark background — paired with `ERROR_RED`'s border/text in the
 * assign-loop galleries' RED (0-count) badge chip and suggestion-row
 * treatments (CharScrollStrip's bad-badge background, MechanismGallery's and
 * TouchGallery's suggestion-row background). Background-only use — maps to
 * the danger background token.
 */
export const ERROR_BG = "var(--app-danger-bg)";

/**
 * Checked survey-chip background (SuggestionChip, ticked state).
 * Background-only use — maps to the accent subtle-fill token (the same
 * "selected" treatment used elsewhere in the design system).
 */
export const CHECKED_CHIP_BG = "var(--app-accent-subtle)";

/**
 * Disabled-control background / divider line color used by the survey panes
 * (same value, dual use — see surveyStyles.ts's `divider` (border) and
 * `primaryButton` (disabled background)). The original hex sat between the
 * old BG_CARD and BORDER, closer to BG_CARD — i.e. a step lighter than the
 * surface, not as strong as a border. `--app-surface-2` is that exact "one
 * step lighter than surface" token and reads correctly for BOTH the
 * divider-line and disabled-background roles; `--app-border` (the epic's
 * general card-border mapping) was tried first but is visibly too bright
 * for the disabled-button fill. See the crew report for the comparison.
 */
export const DISABLED_DIVIDER = "var(--app-surface-2)";

/**
 * Card border color used by editors, diagnostics, metadata, and form panels.
 * Appears 38 times across 18 files — every call site uses it as a
 * `border-color`, never a background or text color, so this is a clean
 * mapping onto the canonical border token.
 */
export const CARD_BORDER = "var(--app-border)";
