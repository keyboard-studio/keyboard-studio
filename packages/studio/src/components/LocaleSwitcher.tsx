// LocaleSwitcher — the UI-locale picker rendered in the NavBar (spec 045 P1).
//
// Reads the active locale from the Lingui context (so it re-renders when the
// locale changes) and, on selection, persists the choice and activates it. The
// option labels are each language's own autonym (English, Français) and are
// deliberately NOT translated — a language picker shows each language in its own
// name. The visible field label IS localized (<Trans>).
import { Trans } from "@lingui/react/macro";
import { useLingui } from "@lingui/react";
import { SelectMenu } from "../ui/SelectMenu.tsx";
import {
  SUPPORTED_LOCALES,
  activateLocale,
  saveLocale,
  type Locale,
} from "../lib/i18n.ts";

const LABEL_ID = "nav-language-label";

export function LocaleSwitcher() {
  const { i18n } = useLingui();

  function handleChange(next: string) {
    saveLocale(next as Locale);
    void activateLocale(next as Locale);
  }

  return (
    <span
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
      <span id={LABEL_ID}>
        <Trans id="nav.language">Language</Trans>
      </span>
      <SelectMenu
        id="nav-language-select"
        ariaLabelledby={LABEL_ID}
        value={i18n.locale}
        onChange={handleChange}
        options={Object.entries(SUPPORTED_LOCALES).map(([code, name]) => ({
          value: code,
          label: name,
        }))}
        style={{ width: 130 }}
      />
    </span>
  );
}
