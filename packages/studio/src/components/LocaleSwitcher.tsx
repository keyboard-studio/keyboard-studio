// LocaleSwitcher — the UI-locale picker rendered in the NavBar (spec 045 P1).
//
// Reads the active locale from the Lingui context (so it re-renders when the
// locale changes) and, on selection, persists the choice and activates it. The
// option labels are each language's own autonym (English, Français) and are
// deliberately NOT translated — a language picker shows each language in its own
// name. The visible field label IS localized (<Trans>).
import { Trans } from "@lingui/react/macro";
import { useLingui } from "@lingui/react";
import {
  SUPPORTED_LOCALES,
  activateLocale,
  saveLocale,
  type Locale,
} from "../lib/i18n.ts";

export function LocaleSwitcher() {
  const { i18n } = useLingui();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    saveLocale(next);
    void activateLocale(next);
  }

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "#e6edf3",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <Trans id="nav.language">Language</Trans>
      <select
        value={i18n.locale}
        onChange={handleChange}
        style={{
          background: "#0d1117",
          color: "#e6edf3",
          border: "1px solid #283040",
          borderRadius: 4,
          padding: "2px 6px",
          fontSize: 13,
        }}
      >
        {Object.entries(SUPPORTED_LOCALES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
