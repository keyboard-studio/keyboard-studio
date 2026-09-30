// NavBar — the studio's top bar: brand mark, route tab links, and the
// right-zone controls (unfinished-gallery indicator, locale/theme switchers,
// account control, survey reset).
//
// Extracted from StudioShell.tsx (mobile adaptation, Phase 1) so the
// slim narrow-viewport variant is independently testable. The narrow branch
// (< 479px) is ONE row: the menu button (route links first, then the
// right-zone controls) and, on the survey, the compact phase summary passed
// in as `narrowCenter` in place of the wordmark. There is no bottom tab bar:
// every vertical pixel below this row goes to the question and the journey
// footer. Desktop rendering is untouched.

import { useRef, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { NAV_ITEMS } from "../lib/navItems.ts";
import type { RouteId } from "../lib/navigate.ts";
import { useStartOverStore } from "../stores/startOverStore.ts";
import { useIsNarrow } from "../hooks/useViewport.ts";
import { useJourneyContentsStore } from "../stores/journeyContentsStore.ts";
import {
  useDismissablePopover,
  POPOVER_PANEL_STYLE,
} from "../ui/useDismissablePopover.ts";
import { CurrentKeyboardIndicator } from "./CurrentKeyboardIndicator.tsx";
import { UnfinishedGalleryIndicator } from "./UnfinishedGalleryIndicator.tsx";
import { LocaleSwitcher } from "./LocaleSwitcher.tsx";
import { ThemeSwitcher } from "./ThemeSwitcher.tsx";
import { AccountControl } from "./AccountControl.tsx";
import { SurveyResetButton } from "./SurveyResetButton.tsx";

export interface NavBarProps {
  active: RouteId;
  /**
   * P0 fix UX signal (not the authoritative enforcement — that lives in
   * OutputScreen/usePreviewArtifact's canDownload gate, which is reachable
   * regardless of how #output was navigated to). Dims the Output tab and
   * marks it aria-disabled with an explanatory title so the block is obvious
   * BEFORE the click, not just after landing on a disabled download button.
   */
  outputBlocked?: boolean;
  /** Tooltip / aria explanation shown while outputBlocked is true. */
  outputBlockedTitle?: string;
  /**
   * Persistent self-serve "go finish unreviewed defaults" indicator (see
   * components/UnfinishedGalleryIndicator.tsx) — computed once in
   * StudioShell from `useAccountedForGate()`, which layers the author's
   * per-surface "mark for later review" state on top of the same
   * `useInventoryCoverageGate()` result that feeds `outputBlocked` above, so
   * the two signals can never disagree about what is actually unimplemented.
   * 0 hides the corresponding half of the indicator.
   */
  unfinishedDesktopCount: number;
  unfinishedTouchCount: number;
  /** Routes back to the named gallery and switches to the #survey route. */
  onNavigateToUnfinishedGallery: (target: "mechanisms" | "touch") => void;
  /**
   * Narrow viewports only: content that replaces the wordmark in the single
   * top row (the survey's compact phase summary). Ignored on desktop.
   */
  narrowCenter?: ReactNode;
}

export function NavBar({
  active,
  outputBlocked = false,
  outputBlockedTitle,
  unfinishedDesktopCount,
  unfinishedTouchCount,
  onNavigateToUnfinishedGallery,
  narrowCenter,
}: NavBarProps) {
  const { i18n: activeI18n, t } = useLingui();
  const startOver = useStartOverStore((s) => s.handler);
  // Mobile adaptation: on narrow viewports the bar slims to one row, the
  // menu (route links + right-zone controls) plus the wordmark or the
  // narrowCenter content. Desktop rendering is untouched.
  const isNarrow = useIsNarrow();
  const [overflowOpen, setOverflowOpen] = useState(false);
  // The journey contents sheet (StudioFooter mounts it) is also reachable
  // from this menu, so the table of contents is one tap from anywhere.
  const contentsAvailable = useJourneyContentsStore((s) => s.available);
  const openContents = useJourneyContentsStore((s) => s.setOpen);
  const overflowContainerRef = useRef<HTMLDivElement | null>(null);
  // Lightweight popover usage (SurveyResetButton precedent): Escape and
  // outside-pointerdown dismiss. Focus is deliberately left where the
  // author put it — on the overflow trigger — rather than opting into the
  // hook's dialog-focus behavior.
  useDismissablePopover(overflowOpen, {
    containerRef: overflowContainerRef,
    onClose: () => setOverflowOpen(false),
  });
  return (
    <nav
      aria-label={resolveMessage(
        activeI18n,
        msg({ id: "nav.ariaLabel", message: "Studio navigation" }),
      )}
      // Translucent chrome on desktop (.ks-chrome-bar-top, index.css):
      // a frosted layer with page content scrolling underneath, fading into
      // the content below through a scroll-edge fade instead of a hairline.
      // The narrow bar keeps its opaque look.
      className={isNarrow ? undefined : "ks-chrome-bar-top"}
      // WRAPS RATHER THAN OVERLAPS. The bar is one row of --topbar-h whenever
      // its three zones fit side by side. When they don't (a ~1280px laptop
      // viewport with every right-zone control showing, 1024px, a long
      // translation), `flexWrap` moves the zone that no longer fits onto a
      // second row instead of letting one zone paint over the next. Before
      // this, the left zone's `minWidth: 0` let its content spill across the
      // tab row, and the current-keyboard selector sat on top of — and
      // swallowed clicks meant for — the Studio tab. Wrapping follows DOM
      // order, so focus order still matches visual reading order (2.4.3),
      // and `minHeight` (not `height`) lets the shell's flex column give
      // the second row its space (StudioShell's root is a column flexbox
      // with this bar `flexShrink: 0`, so nothing below assumes 52px).
      style={{
        minHeight: "var(--topbar-h)",
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 4,
        rowGap: 0,
        padding: "0 16px",
        boxSizing: "border-box",
      }}
    >
      {/* Left zone — brand mark, then the current-keyboard indicator (same
          welcome gate as AccountControl/UnfinishedGalleryIndicator — nothing
          to name before a keyboard exists). flex: 1 1 0 balances the right
          zone so the center zone (the tab list) sits optically centered.
          NO `minWidth: 0` here on purpose: the zone's automatic minimum is
          its min-content width (wordmark + the indicator at its SHRUNK
          width — see CurrentKeyboardIndicator's SELECT_MIN_WIDTH), and that
          floor is what makes the bar wrap instead of overflowing into the
          tabs. `minHeight` keeps a wrapped second row from collapsing
          against the bar's bottom border. */}
      {isNarrow && narrowCenter !== undefined ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flex: "1 1 0",
            minWidth: 0,
            minHeight: 44,
          }}
        >
          {narrowCenter}
        </div>
      ) : (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          flex: "1 1 0",
          minHeight: 44,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--app-text)",
            fontFamily: "var(--app-font)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {/* Wrapped like every other occurrence of the product name
              (welcome.title, profile.accountKind.signedIn) — translators
              decide whether it transliterates, we don't decide for them. */}
          <Trans id="nav.wordmark">Keyboard Studio</Trans>
        </span>
        {/* Narrow viewports hide the keyboard indicator — the slim bar keeps
            brand + overflow only (mobile adaptation, Phase 1). */}
        {!isNarrow && active !== "welcome" && <CurrentKeyboardIndicator />}
      </div>
      )}

      {/* Center zone — tab links. flex: 0 0 auto — sized to its content, not
          stretched, which is what keeps it centered between the two flex:1
          side zones rather than left- or right-anchored.
          Hidden on narrow viewports: the same links head the menu panel. */}
      {!isNarrow && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flex: "0 0 auto",
          }}
        >
          {NAV_ITEMS.map(({ id, label }) => {
            const isActive = id === active;
            const isBlocked = id === "output" && outputBlocked;
            return (
              <a
                key={id}
                href={`#${id}`}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={isBlocked ? "true" : undefined}
                title={isBlocked ? outputBlockedTitle : undefined}
                style={{
                  padding: "4px 12px",
                  fontSize: 14,
                  fontFamily:
                    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                  textDecoration: "none",
                  // Blocked state signals via COLOR ALONE (var(--app-text-disabled),
                  // itself a reduced-alpha token) — it must not also stack an
                  // `opacity` on top, which double-dims and can drop the state
                  // below contrast requirements the token was already tuned for.
                  color: isBlocked
                    ? "var(--app-text-disabled)"
                    : isActive
                      ? "var(--app-accent-text)"
                      : "var(--app-text)",
                  borderBottom: isActive
                    ? "2px solid var(--app-accent)"
                    : "2px solid transparent",
                  lineHeight: "40px",
                  whiteSpace: "nowrap",
                  transition:
                    "color 120ms ease, border-bottom-color 120ms ease",
                }}
              >
                {resolveMessage(activeI18n, label)}
              </a>
            );
          })}
        </div>
      )}

      {/* Right zone — desktop: unfinished-gallery return indicator (hidden on
          welcome, same as the account control — nothing to return to before
          a keyboard exists) + locale switcher + theme switcher (all routes)
          + account control (hidden on welcome) + survey reset in the far
          corner. flex: 1 1 0 mirrors the left zone's width so the center
          zone stays centered; justify-content: flex-end keeps these
          controls pinned to the right edge within that zone. The reset is
          last so it can't crowd the controls beside it; it renders only
          while a survey is mounted (startOverStore publishes the handler
          from SurveyView, which exists on the #survey route alone).
          Narrow viewports (mobile adaptation): the whole zone collapses into
          a single 44px menu disclosure. The panel lists the route links first
          (same NAV_ITEMS, same blocked-Output treatment), then stacks the
          same controls vertically — same set, same order, same welcome
          gates — so nothing is lost, only re-homed. */}
      {isNarrow ? (
        <div
          ref={overflowContainerRef}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flex: "1 1 0",
            minHeight: 44,
          }}
        >
          <button
            type="button"
            className="ks-focus-ring"
            aria-label={t({
              id: "nav.menu.label",
              message: "Menu",
            })}
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((v) => !v)}
            style={{
              width: "var(--app-touch-target)",
              height: "var(--app-touch-target)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderRadius: 8,
              color: "var(--app-text)",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true">☰</span>
          </button>
          {overflowOpen && (
            <div
              style={{
                ...POPOVER_PANEL_STYLE,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 2,
                minWidth: 200,
                maxWidth: "calc(100vw - 32px)",
                padding: "8px",
                boxSizing: "border-box",
              }}
            >
              <ul
                aria-label={t({
                  id: "nav.tabBar.ariaLabel",
                  message: "Studio sections",
                })}
                style={{
                  listStyle: "none",
                  margin: "0 0 6px",
                  padding: "0 0 6px",
                  borderBottom: "1px solid var(--app-border)",
                }}
              >
                {NAV_ITEMS.map(({ id, label }) => {
                  const isActive = id === active;
                  const isBlocked = id === "output" && outputBlocked;
                  return (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className="ks-focus-ring"
                        aria-current={isActive ? "page" : undefined}
                        aria-disabled={isBlocked ? "true" : undefined}
                        title={isBlocked ? outputBlockedTitle : undefined}
                        onClick={() => setOverflowOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          minHeight: "var(--app-touch-target)",
                          padding: "0 12px",
                          borderRadius: 6,
                          textDecoration: "none",
                          fontSize: 15,
                          fontWeight: isActive ? 700 : 500,
                          fontFamily: "var(--app-font)",
                          // Active: accent bar + weight, never colour alone.
                          borderLeft: isActive
                            ? "3px solid var(--app-accent)"
                            : "3px solid transparent",
                          background: isActive
                            ? "var(--app-accent-subtle)"
                            : "transparent",
                          color: isBlocked
                            ? "var(--app-text-disabled)"
                            : isActive
                              ? "var(--app-accent-text)"
                              : "var(--app-text)",
                        }}
                      >
                        {resolveMessage(activeI18n, label)}
                      </a>
                    </li>
                  );
                })}
              </ul>
              {contentsAvailable && (
                <button
                  type="button"
                  className="ks-focus-ring"
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    setOverflowOpen(false);
                    // Hand the sheet the trigger point so its enter/exit
                    // animation anchors at the menu item that opened it.
                    const rect = e.currentTarget.getBoundingClientRect();
                    openContents(true, {
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  data-testid="nav-journey-contents"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: "var(--app-touch-target)",
                    padding: "0 12px",
                    margin: "0 0 6px",
                    border: "none",
                    borderRadius: 6,
                    background: "transparent",
                    color: "var(--app-text)",
                    fontSize: 15,
                    fontWeight: 500,
                    fontFamily: "var(--app-font)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <Trans id="journeyContents.menuItem">Contents</Trans>
                </button>
              )}
              {active !== "welcome" && (
                <UnfinishedGalleryIndicator
                  desktopCount={unfinishedDesktopCount}
                  touchCount={unfinishedTouchCount}
                  onNavigate={onNavigateToUnfinishedGallery}
                />
              )}
              <LocaleSwitcher />
              <ThemeSwitcher />
              {active !== "welcome" && <AccountControl />}
              {startOver !== null && <SurveyResetButton onReset={startOver} />}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            flex: "1 1 0",
            minHeight: 44,
          }}
        >
          {active !== "welcome" && (
            <UnfinishedGalleryIndicator
              desktopCount={unfinishedDesktopCount}
              touchCount={unfinishedTouchCount}
              onNavigate={onNavigateToUnfinishedGallery}
            />
          )}
          <LocaleSwitcher />
          <ThemeSwitcher />
          {active !== "welcome" && <AccountControl />}
          {startOver !== null && <SurveyResetButton onReset={startOver} />}
        </div>
      )}
    </nav>
  );
}
