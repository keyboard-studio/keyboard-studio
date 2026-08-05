import type { CSSProperties, ReactNode } from "react";
import { CSS_BORDER_STRONG, CSS_FONT_MONO, CSS_SURFACE_2, CSS_TEXT_MUTED } from "./theme.ts";

// Consolidated (P1, second-pass review) from a byte-for-byte duplicate that
// briefly lived at editors/assignLoop/parts/KeyCap.tsx — this file is now the
// ONE KeyCap primitive. The style below is that original component's exact
// values (a proven fit for the tight chip/grid contexts it already ships in
// — GlyphCell tiles, StatusBar's removed-list rows, InfoView's title bar),
// ported from its own `var(--app-*)` literals onto this module's theme.ts
// token accessors so it never hardcodes a color/font outside that one
// source, and dark-mode-safe by construction (the tokens are already
// theme-reactive CSS custom properties).
const style: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 14,
  height: 15,
  padding: "0 3px",
  borderRadius: 3,
  font: `600 10px/1 ${CSS_FONT_MONO}`,
  background: CSS_SURFACE_2,
  border: `1px solid ${CSS_BORDER_STRONG}`,
  color: CSS_TEXT_MUTED,
};

/**
 * Small boxed/monospace keycap label for a physical-key name, e.g. the "q"
 * in "Replace the [q] key with 'é'" (the desktop key-naming-ambiguity fix —
 * a bare uppercase "Q" reads as the capital *character*, not the physical
 * q key; boxing it as a keycap plus the surrounding word "key" disambiguates
 * it visually and textually).
 *
 * Purely presentational — callers resolve the text content through
 * `lib/keyLabel.ts`'s `physicalKeyLabel` (or an equivalent casing-aware
 * helper); this component only supplies the visual box. Renders a semantic
 * `<kbd>` so the convention is also legible to assistive tech without extra
 * ARIA.
 */
export function KeyCap({ children }: { children: ReactNode }) {
  return <kbd style={style}>{children}</kbd>;
}
