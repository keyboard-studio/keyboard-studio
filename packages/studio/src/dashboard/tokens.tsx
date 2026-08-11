// Shared typography tokens for flowmap views.

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Semantic color palette for dashboard views (epic #533) — every value is an
// existing --app-* semantic token (colors.css) so every consumer stays
// theme-aware (light / navy) for free. Where no --app-* semantic exists yet
// (teal, purple — this page's "proposed"/"reserve" categories), the closest
// existing brand token (brand.css's --sil-*) is reused instead of a raw hex
// literal; these two are flagged as a gap, not silently invented.
//
// Pattern per status family: "base"/"light" (readable-as-TEXT shade) ->
// var(--app-{status}-text); "dark" (border/fill shade) -> var(--app-{status});
// "bg" (background tint) -> var(--app-{status}-bg). See colors.css's own
// header comment for why the plain status token is the one meant for
// borders/fills and the "-text" variant is the one meant for text.
export const COLORS = {
  // Primary blues — the app's one accent family.
  blue: {
    base: "var(--app-accent-text)",
    dark: "var(--app-accent)",
    light: "var(--app-accent-text)",
    bg: "var(--app-accent-bg)",
  },
  // Success greens.
  green: { base: "var(--app-success-text)", dark: "var(--app-success)", bg: "var(--app-success-bg)" },
  // Warning ambers.
  amber: {
    base: "var(--app-warning-text)",
    dark: "var(--app-warning)",
    light: "var(--app-warning-text)",
    bg: "var(--app-warning-bg)",
  },
  // Error reds.
  red: { base: "var(--app-danger-text)", dark: "var(--app-danger)", bg: "var(--app-danger-bg)" },
  // Teal (proposed/library) — no --app-teal semantic exists; closest existing
  // token is the SIL light-blue brand family.
  teal: { base: "var(--sil-light-blue)", dark: "var(--sil-light-blue-dark)", bg: "var(--sil-light-blue-10)" },
  // Purple (reserve) — no --app-purple semantic exists; closest existing
  // token is the SIL violet brand family.
  purple: { base: "var(--sil-violet)", dark: "var(--sil-violet-dark)", bg: "var(--sil-violet-10)" },
  // Grays — four text weights map onto the app's text/muted/subtle/disabled
  // tiers by relative lightness; the two background/panel tiers map onto
  // surface/surface-2.
  gray: {
    text: "var(--app-text)",
    textMuted: "var(--app-text-muted)",
    textDim: "var(--app-text-subtle)",
    textVeryDim: "var(--app-text-disabled)",
    border: "var(--app-border)",
    borderStrong: "var(--app-border-strong)",
    bg: "var(--app-bg)",
    bgPanel: "var(--app-surface-2)",
    bgCard: "var(--app-surface)",
    bgCanvas: "var(--app-bg)",
  },
} as const;

// Common style fragments
export const STYLES = {
  border: `1px solid ${COLORS.gray.border}`,
  borderStrong: `1px solid ${COLORS.gray.borderStrong}`,
  borderRadius: { small: 4, medium: 6, large: 8 },
} as const;

// Shared Badge component for chip-style UI elements
export function Badge({
  text,
  bg,
  border,
  color,
  size = "medium",
}: {
  text: string;
  bg: string;
  border: string;
  color: string;
  size?: "small" | "medium";
}) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: size === "small" ? 11.5 : 12.5,
        padding: "2px 8px",
        borderRadius: 5,
        background: bg,
        border: `1px solid ${border}`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}
