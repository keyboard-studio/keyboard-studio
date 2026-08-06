// AppRoot — the one <I18nProvider> for every tree main.tsx mounts.
//
// WHY THIS EXISTS (regression guard): the provider used to live inside
// StudioShell, which also called `useLingui()` in its own body. A component
// cannot consume a context it renders itself — `useContext(LinguiContext)`
// returns null for its own provider's owner — so the very first paint threw.
// In a dev build Lingui's invariant turns that into a readable
// "useLingui hook was used without I18nProvider"; in a production build the
// invariant is stripped and it surfaces as a bare
// "Cannot destructure property '_' of ... as it is null" against a blank page.
//
// The other two root renders (OAuthCallbackScreen, LintDemo) had no provider at
// all and crashed the same way. Hoisting the provider above all three fixes the
// whole class: every component main.tsx mounts — including the shell itself —
// is now a consumer, never its own provider.
//
// Keep this the ONLY place the app-side <I18nProvider> is rendered. Tests wrap
// with test/renderWithI18n.tsx instead (same provider, test-owned catalog).
import type { ReactNode } from "react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import "./lib/i18n.ts"; // side-effect: load + activate the boot locale
import { CrashErrorBoundary } from "./components/CrashErrorBoundary.tsx";
import { CrashNotice } from "./components/CrashNotice.tsx";

export function AppRoot({ children }: { children: ReactNode }) {
  // The crash boundary sits INSIDE the provider for the same reason the
  // provider was hoisted here in the first place: its fallback uses the
  // catalog, so it must be a consumer, never a sibling above it. One boundary
  // here covers all three trees main.tsx mounts (spec 060 FR-001).
  //
  // CrashNotice sits OUTSIDE the boundary, as its sibling. It reports the
  // `onerror`/`unhandledrejection` cases, where the page is still usable — so
  // it must survive a render crash in `children` rather than being unmounted by
  // it. It renders nothing at all until a report has actually been sent.
  return (
    <I18nProvider i18n={i18n}>
      <CrashErrorBoundary>{children}</CrashErrorBoundary>
      <CrashNotice />
    </I18nProvider>
  );
}
