// Canonical viewport breakpoints for the studio's responsive layer.
//
// CSS custom properties cannot drive media-query conditions, so breakpoints
// live here in TypeScript — the single vocabulary every viewport branch
// reads: `useViewport()` / `useIsNarrow()` match against these values, the
// `.ks-mobile-*` utilities' comments cite them, and the Playwright mobile
// project's device descriptors are chosen to straddle them.
//
// The two widths are not new: 479px is the footer rule's existing threshold
// (`index.css`) and 768px is the seed panel's existing collapse point. No new
// magic numbers — a new breakpoint needs a design-level reason, not a
// one-off px value at a call site.
export const BREAKPOINTS = {
  /** Narrow phone: stacked layouts, thumb-zone navigation, bottom sheets. */
  mobileMax: 479,
  /** Small tablet / large phone: two-pane collapses that need more room. */
  tabletMax: 768,
  /**
   * Scarce height: viewports at or below this height get compact vertical
   * treatment (viewport-relative OSK sizing, side-docked sheets). The
   * design-level reason is the landscape phone (844×390 class): width is
   * plentiful so it is NOT narrow, but 390px of height cannot fit a 560px
   * keyboard plus chrome. 500px clears every common landscape-phone height
   * with margin.
   */
  shortHeightMax: 500,
} as const;
