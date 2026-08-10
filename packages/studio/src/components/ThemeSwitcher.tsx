// ThemeSwitcher — the navy/light toggle rendered in the NavBar's right zone,
// beside LocaleSwitcher (epic #533 design-system foundation).
//
// Visual/ARIA shape deliberately mirrors LocaleSwitcher: an inline label span
// (same font-size/color/gap) plus a single interactive control. The control
// itself is a real toggle BUTTON (WAI-ARIA APG "Button (Toggle Button)" —
// `aria-pressed`) rather than LocaleSwitcher's listbox-backed SelectMenu:
// theme is a strict two-value choice, and a two-item dropdown would be a
// heavier affordance for the same binary decision a single toggle already
// covers.
//
// Persistence + paint go through lib/theme.ts (already written — this
// component only calls it): `applyTheme` flips the `data-theme` attribute
// immediately, `saveTheme` persists the choice. No second storage mechanism.
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  applyTheme,
  loadSavedTheme,
  saveTheme,
  DEFAULT_THEME,
  type AppTheme,
} from "../lib/theme.ts";

const LABEL_ID = "nav-theme-label";

/** Moon (navy/dark active) — single-stroke, round caps, no fill. */
function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

/** Sun (light active) — single-stroke, round caps, no fill. */
function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function ThemeSwitcher() {
  const { t } = useLingui();
  const [theme, setTheme] = useState<AppTheme>(() => loadSavedTheme() ?? DEFAULT_THEME);
  const isLight = theme === "light";

  function toggle() {
    const next: AppTheme = isLight ? "navy" : "light";
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "var(--app-text)",
        fontFamily: "var(--app-font)",
      }}
    >
      <span id={LABEL_ID}>
        <Trans id="theme.switcher.label">Theme</Trans>
      </span>
      <button
        type="button"
        data-testid="theme-switcher"
        aria-labelledby={LABEL_ID}
        aria-pressed={isLight}
        onClick={toggle}
        title={
          isLight
            ? t({ id: "theme.switcher.switchToNavy", message: "Switch to navy theme" })
            : t({ id: "theme.switcher.switchToLight", message: "Switch to light theme" })
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "transparent",
          border: "1px solid var(--app-border-strong)",
          borderRadius: "var(--app-radius-sm)",
          color: "inherit",
          fontFamily: "inherit",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {isLight ? <SunIcon /> : <MoonIcon />}
        <span>
          {isLight
            ? t({ id: "theme.switcher.light", message: "Light" })
            : t({ id: "theme.switcher.navy", message: "Navy" })}
        </span>
      </button>
    </span>
  );
}
