// MobileTabBar — bottom tab bar for narrow viewports (mobile adaptation
// mobile adaptation, Phase 1).
//
// Renders the same NAV_ITEMS as the desktop NavBar (Studio · Compare ·
// Output · Decisions, plus the dev-gated Flow Map) as a 64px bottom bar when
// `useIsNarrow()` is true, and null otherwise — desktop markup is untouched.
// The shell's top NavBar hides its center tab row on narrow viewports, so
// this bar is the primary route navigation there: thumb-zone height, one tap
// per tab, the active tab marked by a top accent indicator plus
// `aria-current="page"` (colour is never the only signal).
//
// The blocked-Output treatment (dim + aria-disabled + explanatory title)
// mirrors NavBar's — the same props flow to both from StudioShell, so the
// two bars can never disagree about the gate.

import type { CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { useIsNarrow } from "../hooks/useViewport.ts";
import { NAV_ITEMS } from "../lib/navItems.ts";
import type { RouteId } from "../lib/navigate.ts";

export interface MobileTabBarProps {
  active: RouteId;
  /**
   * Same UX signal as NavBar's `outputBlocked` — dims the Output tab and
   * marks it aria-disabled with an explanatory title BEFORE the click (the
   * authoritative gate lives in OutputScreen/usePreviewArtifact's
   * canDownload, reachable regardless of how #output is navigated to).
   */
  outputBlocked?: boolean;
  /** Tooltip / aria explanation shown while outputBlocked is true. */
  outputBlockedTitle?: string;
}

const BAR_STYLE: CSSProperties = {
  height: 64,
  flexShrink: 0,
  display: "flex",
  alignItems: "stretch",
  background: "var(--app-surface)",
  borderTop: "1px solid var(--app-border)",
  boxSizing: "border-box",
  // The tab bar sits at the very bottom of the column shell (below
  // StudioFooter) so it stays in the thumb zone on phones.
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
};

const TAB_BASE_STYLE: CSSProperties = {
  flex: "1 1 0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  minWidth: 0,
  textDecoration: "none",
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "var(--app-font)",
  borderTop: "3px solid transparent",
  boxSizing: "border-box",
  // 64px bar height clears the shared 44px touch target with room to spare.
  minHeight: "var(--app-touch-target)",
};

export function MobileTabBar({
  active,
  outputBlocked = false,
  outputBlockedTitle,
}: MobileTabBarProps) {
  const isNarrow = useIsNarrow();
  const { i18n, t } = useLingui();

  // Desktop renders no tab bar at all — the top NavBar owns navigation
  // there. Returning null (not `display: none`) keeps it out of the
  // accessibility tree and the flex layout entirely.
  if (!isNarrow) return null;

  return (
    <nav
      aria-label={t({
        id: "nav.tabBar.ariaLabel",
        message: "Studio sections",
      })}
      style={BAR_STYLE}
      data-testid="mobile-tab-bar"
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
              ...TAB_BASE_STYLE,
              borderTopColor: isActive ? "var(--app-accent)" : "transparent",
              // Blocked state signals via COLOR ALONE (the
              // --app-text-disabled token, already tuned for contrast) — no
              // stacked `opacity`, which would double-dim below the token's
              // intended value (same rule as NavBar's blocked tab).
              color: isBlocked
                ? "var(--app-text-disabled)"
                : isActive
                  ? "var(--app-accent-text)"
                  : "var(--app-text-muted)",
            }}
          >
            {resolveMessage(i18n, label)}
          </a>
        );
      })}
    </nav>
  );
}
