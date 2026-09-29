// Shared nav-item table for the studio's top-level navigation.
//
// Moved out of StudioShell.tsx (mobile adaptation #1853, Phase 1): the new
// MobileTabBar renders the same items at the bottom of narrow viewports, and
// importing them from StudioShell would create a StudioShell ↔
// MobileTabBar module cycle (forbidden by depcruise). Both NavBar (in
// StudioShell.tsx) and MobileTabBar import from here, so the two bars can
// never drift apart.

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RouteId } from "./navigate.ts";

// The Flow Map is a developer aid. It shows automatically in `vite dev`; in
// hosted builds (Vercel previews, future production) it is gated by
// VITE_SHOW_FLOWMAP=1 so the kill switch lives in env config, not code.
export const SHOW_FLOWMAP =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_FLOWMAP === "1";

export interface NavItem {
  id: RouteId;
  /**
   * Lazy `msg` descriptor — NAV_ITEMS is built at module scope where no
   * useLingui() binding exists, so labels are resolved per-render via
   * resolveMessage(i18n, ...) at the call site (the same pattern
   * MechanismGallery uses for its module-scope option tables).
   */
  label: MessageDescriptor;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "survey", label: msg({ id: "nav.studio", message: "Studio" }) },
  // Spec 057 FR-020: a NEW message id, not a re-worded one. The tab's
  // purpose changed — it is a read-only comparison surface now, not a
  // preview of the author's own keyboard — so an existing translation of
  // "Preview" is not a translation of this.
  { id: "preview", label: msg({ id: "nav.compare", message: "Compare" }) },
  { id: "output", label: msg({ id: "nav.output", message: "Output" }) },
  // Spec 053 FR-017: unconditional, alongside Output and Preview rather than
  // beside the dev-gated Flow Map below.
  {
    id: "trail",
    label: msg({ id: "nav.decisionTrail", message: "Decisions" }),
  },
  ...(SHOW_FLOWMAP
    ? [
        {
          id: "flowmap" as const,
          label: msg({ id: "nav.flowMap", message: "Flow Map" }),
        },
      ]
    : []),
];
